const babel = require('@babel/core');
const _ = require('lodash');

const { getUniqueKeyFromFreeText } = require('./lut');

// Dont extract value for Literals under this attribute
const isBlacklistedForJsxAttribute = (path) => {
  const blacklistedJsxAttributes = [
    // React router
    'path',
    'from',
    'to',
    'href',
    'as',
    // Inline style
    'style',
    'className',
    'color',
    // Code
    'dangerouslySetInnerHTML',
    'src',
  ];
  const jsxAttributeParent = path.findParent(p => p.isJSXAttribute());
  if (!jsxAttributeParent) return false;
  const name = _.get(jsxAttributeParent, 'node.name.name');
  if (blacklistedJsxAttributes.includes(name)) return true;
  return false;
};

const isJSXAttributeAllowed = (path) => {
  const allowedJSXAttributes = [
    'children', 'content', 'button', 'title', 'alt', 'header', 'footer', 'text',
  ];
  const name = _.get(path, 'node.name.name');
  return allowedJSXAttributes.includes(name);
};


const handleConditionalExpressions = (path, t) => {
  // For ternary operators
  // if (!path.findParent(p => p.isConditionalExpression())) return;

  // Only extract the value of identifiers
  // who are children of some JSX element
  const jsx = path.findParent(p => p.isJSXElement());
  if (!jsx) return;
  // console.log(path.parent && path.parent.name && path.parent.name.name);
  // Check for blacklist
  if (isBlacklistedForJsxAttribute(path)) return;

  const coreValue = _.get(path, 'node.value', '').trim();
  if (!coreValue.length) return;
  const kValue = getUniqueKeyFromFreeText(coreValue);
  // TODO: OPTIMIZATION: Use quasi quotes to optimize this

  const srcString = `i18n.t(Keys.${kValue})`;
  if (babel.types.isJSXAttribute(path.parent)) {
    if (isJSXAttributeAllowed(path.parent)) {
      // srcString = `{${srcString}}`;
      // console.log('parent is JSX attribute', path.parent.name.name, srcString);
      path.replaceWith(t.JSXExpressionContainer(t.stringLiteral(srcString)));
      // path.skip();
    }
  } else {
    // console.log(srcString);
    path.replaceWithSourceString(srcString);
  }
};


module.exports = {
  isBlacklistedForJsxAttribute,
  handleConditionalExpressions,
  isJSXAttributeAllowed,
};
