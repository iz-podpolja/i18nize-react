const _ = require('lodash');

const { i18nextImportStatement, kImportStatement } = require('./frozen-asts');

const { getUniqueKeyFromFreeText, LutManager } = require('./lut');

const {
  isBlacklistedForJsxAttribute,
  handleConditionalExpressions,
  isJSXAttributeAllowed,
  getElementNames,
} = require('./plugin-helpers');

const handleStringLiteral = (path, table, key, topLevel) => {
  const { value } = path.node;
  if (!table[key]) table[key] = {};
  if (!table[key].pairs) table[key].pairs = [];
  table[key].pairs.push({ path, value, topLevel });
};

const extractValueAndUpdateTable = (t, table, path, key, topLevel) => {
  if (t.isStringLiteral(path.node)) {
    handleStringLiteral(path, table, key, topLevel);
  } else if (t.isArrayExpression(path.node)) {
    path.get('elements').forEach((element) => {
      if (t.isStringLiteral(element.node)) {
        handleStringLiteral(element, table, key, topLevel);
      }
    });
  }
};


const isParentNodeExportDeclaration = node => node.parent.type === 'ExportDeclaration' || node.parent.type === 'ExportNamedDeclaration' || node.parent.type === 'ExportDefaultDeclaration';


const handleFunction = (me, path) => {
  // console.log(path.parent && path.parent.type);
  if (isParentNodeExportDeclaration(path)) {
    me.path = path.parent.declaration.id.name;
    // console.log('one', me.path);
    return;
  }
  const assignment = path.findParent(p => p.isVariableDeclaration());
  if (assignment) {
    if (!assignment.parent || isParentNodeExportDeclaration(assignment) || assignment.parent.type === 'Program') {
      me.path = assignment.node.declarations[0].id.name;
      // console.log('two', me.path);
    }
  }
};

const extractPathFromFileName = (fileName) => {
  if (fileName.includes('shared')) return [];
  const dirs = fileName.split('.');
  const arr = dirs[dirs.length - 2].split('/');
  const start = arr.indexOf('application');
  if (start < 0) {
    return [];
  }
  const res = arr.slice(start + 1, arr.length - 2);
  return res;
};

const getElementNodeNames = (element) => {
  const elementName = _.get(element, 'openingElement.name.name');
  if (elementName) return [elementName];
  return [_.get(element, 'openingElement.name.object.name'), _.get(element, 'openingElement.name.property.name')];
};

const isBlacklistedTag = tag => !['a', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'ul', 'li', 'ol', 'strong', 'b', 'span', 'em'].includes(tag);

const isBlacklistedAttribute = attribute => !['name', 'src', 'id', 'link', 'label', 'alt', 'title', 'target', 'rel', 'className'].includes(attribute);

const isStaticHTMLNode = ele => ['JSXElement', 'JSXText', 'JSXFragment'].includes(ele.type);

const isStaticHTML = (jsx) => {
  const isStatic = isStaticHTMLNode(jsx);
  if (!isStatic) {
    return false;
  }
  if (jsx.type === 'JSXText') return true;
  const names = getElementNodeNames(jsx).filter(Boolean);
  if (!names.length) return false;
  if (names.length > 1) {
    // console.log(jsx);
    // console.log('has multiple names aka nested export', names);
    return false;
  }
  if (names.find(isBlacklistedTag)) {
    // console.log('has a blacklisted tag');
    return false;
  }
  const result = !(jsx.attributes || []).find(attr => attr.type !== 'JSXAttribute' || isBlacklistedAttribute(attr.name.name) || (attr.value && attr.value.type !== 'StringLiteral'));
  // console.log(result);
  return result;
};


const isJSXElementContentStatic = (jsx, topLevel = true) => {
  if (!topLevel && !isStaticHTML(jsx)) return false;
  if (topLevel && !jsx.children.length) return false;
  return !(jsx.children || []).find(child => !isJSXElementContentStatic(child, false));
};


module.exports = ({ types: t }, fileName) => ({
  name: 'i18ize-react',
  visitor: {
    Program: {
      enter() {
        this.basePaths = [...extractPathFromFileName(fileName)];
        this.path = '';
        this.state = {};
        this.alreadyImportedK = false;
        this.alreadyImportedi18n = false;
        LutManager.resetGetUniqueKeyFromFreeTextNumCalls();
      },
      exit(programPath) {
        Object.keys(this.state).forEach((key) => {
          if (this.state[key].valid && this.state[key].pairs) {
            this.state[key].pairs.forEach(({ path, value, topLevel }) => {
              // TODO: OPTIMIZATION: Use quasi quotes to optimize this
              const kValue = getUniqueKeyFromFreeText(value, [...topLevel, key]);
              path.replaceWithSourceString(`i18n.t(Keys.${kValue})`);
            });
          }
        });
        // Do not add imports if there is no replaceable text
        // in this file
        if (LutManager.getUniqueKeyFromFreeTextNumCalls > 0) {
          if (!this.alreadyImportedK) {
            programPath.node.body.unshift(_.cloneDeep(kImportStatement));
          }
          if (!this.alreadyImportedi18n) {
            programPath.node.body.unshift(_.cloneDeep(i18nextImportStatement));
          }
        }
      },
    },
    ImportDeclaration: {
      enter(path) {
        // For idempotence
        if (path.node.source.value.match(/i18n\/keys/)) {
          this.alreadyImportedK = true;
        }
        if (path.node.source.value.match(/^i18next$/)) {
          this.alreadyImportedi18n = true;
        }
      },
    },
    Identifier: {
      enter(path) {
        // Only extract the value of identifiers
        // who are children of some JSX element
        if (path.findParent(p => p.isJSXElement())) {
          this.state[path.node.name] = _.merge(this.state[path.node.name], {
            valid: true,
          });
        }
      },
    },
    FunctionDeclaration: {
      enter(path) {
        handleFunction(this, path);
      },
    },
    FunctionExpression: {
      enter(path) {
        handleFunction(this, path);
      },
    },
    ArrowFunctionExpression: {
      enter(path) {
        handleFunction(this, path);
      },
    },
    TemplateLiteral: {
      enter(path) {
        // Only extract the value of identifiers
        // who are children of some JSX element
        const firstJsxParent = path.findParent(p => p.isJSXElement());
        if (!firstJsxParent) return;
        const elementNames = getElementNames(firstJsxParent);
        // console.log(firstJsxParent.node, attributeName);
        // Ignore CSS strings
        if (
          elementNames[0] === 'style'
        ) {
          return;
        }

        if (isBlacklistedForJsxAttribute(path)) return;

        const { expressions, quasis } = path.node;
        expressions.forEach((expression) => {
          const key = expression.name;
          this.state[key] = _.merge(this.state[key], { valid: true });
        });
        quasis.forEach((templateElement, index) => {
          const coreValue = templateElement.value.raw.trim();
          if (coreValue.length) {
            const qPath = path.get('quasis')[index];
            const kValue = getUniqueKeyFromFreeText(coreValue, [...this.basePaths, this.path, ...elementNames]);
            // TODO: OPTIMIZATION: Use quasi quotes to optimize this
            // TODO: Replace the path instead of modifying the raw
            qPath.node.value.raw = qPath.node.value.raw.replace(
              coreValue,
              `\${i18n.t(Keys.${kValue})}`,
            );
            qPath.node.value.cooked = qPath.node.value.cooked.replace(
              coreValue,
              `\${i18n.t(Keys.${kValue})}`,
            );
          }
        });
      },
    },
    AssignmentExpression: {
      enter(path) {
        // TODO: Explore the reason behind crash
        const key = _.get(
          path,
          'node.left.name',
          _.get(path, 'node.left.property.name'),
        );
        if (!key) return;
        extractValueAndUpdateTable(t, this.state, path.get('right'), key, [...this.basePaths, this.path]);
      },
    },
    ObjectProperty: {
      enter(path) {
        const key = _.get(path, 'node.key.name');
        if (!key) return;

        // Check for blacklist
        if (isBlacklistedForJsxAttribute(path)) return;

        extractValueAndUpdateTable(t, this.state, path.get('value'), key, [...this.basePaths, this.path]);
      },
    },
    JSXElement: {
      enter(path) {
        if (isJSXElementContentStatic(path.node)) {
          let value = '';
          const isStatic = isStaticHTML(path.node);
          if (isStatic) {
            value = path.toString();
          } else {
            if (path.node.children.length === 1 && path.node.children[0].type === 'JSXText') {
              return;
            }
            path.get('children').forEach((child) => {
              value += child.toString();
            });
          }
          const elementNames = getElementNames(path);

          const key = getUniqueKeyFromFreeText(value, [...this.basePaths, this.path, ...elementNames], 'text');
          const node = t.jsxElement(t.JSXOpeningElement(t.jsxIdentifier('DSIHtml'), [t.jsxAttribute(t.jsxIdentifier('content'), t.JSXExpressionContainer(t.callExpression(t.Identifier('i18n.t'), [
            t.identifier(`Keys.${key}`),
          ])))], true), null, [], true);
          if (!isStatic && elementNames.join('.') !== 'React.Fragment') {
            path.node.children = [
              node,
            ];
          } else {
            path.replaceWith(node);
          }

          path.skip();
        }
      },
    },
    VariableDeclarator: {
      enter(path) {
        // TODO: Explore the reason behind crash
        const key = _.get(path, 'node.id.name');
        if (!key) return;

        // Check for blacklist
        if (isBlacklistedForJsxAttribute(path)) return;

        extractValueAndUpdateTable(t, this.state, path.get('init'), key, [...this.basePaths, this.path]);
      },
    },
    JSXText: {
      enter(path) {
        const coreValue = _.get(path, 'node.value', '').trim();
        if (!coreValue.length) return;
        const element = path.findParent(p => p.isJSXElement());
        if (!element) return;
        const elementNames = getElementNames(element);
        const kValue = getUniqueKeyFromFreeText(coreValue, [...this.basePaths, this.path, ...elementNames], 'text');

        // TODO: OPTIMIZATION: Use quasi quotes to optimize this
        path.node.value = path.node.value.replace(
          coreValue,
          `{i18n.t(Keys.${kValue})}`,
        );
      },
    },
    JSXAttribute: {
      enter(path) {
        if (!isJSXAttributeAllowed(path)) return;
        const coreValue = _.get(path, 'node.value', {});

        if (!coreValue || coreValue.type !== 'StringLiteral') return;
        const value = coreValue.value.trim();
        if (!value.length) return;
        const attributeName = _.get(path, 'node.name.name', '');
        const element = path.findParent(p => p.isJSXElement());
        if (!element) return;
        const elementNames = getElementNames(element);
        const kValue = getUniqueKeyFromFreeText(value, [...this.basePaths, this.path, ...elementNames, attributeName]);
        // TODO: OPTIMIZATION: Use quasi quotes to optimize this
        path.node.value = t.JSXExpressionContainer(t.callExpression(t.Identifier('i18n.t'), [
          t.identifier(`Keys.${kValue}`),
        ]));
      },
    },
    StringLiteral: {
      enter(path) {
        handleConditionalExpressions(path, t, [...this.basePaths, this.path]);
      },
    },
  },
});
