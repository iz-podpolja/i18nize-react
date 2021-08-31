
const randChinese = require('randchinese');

const MAX_ITERATIONS = 1000;

let lut = {};

const DEFAULT_MAX_LENGTH = 64;
let maxLength = DEFAULT_MAX_LENGTH;


const randomChineseLutConverter = myLut => Object.keys(myLut).reduce(
  (acc, next) => ({
    ...acc,
    [next]: randChinese(myLut[next].length),
  }),
  {},
);

const LutManager = {
  getLut: () => lut,
  setLut: (newLut) => {
    lut = newLut;
  },
  getKeys: (useValue = false, l = lut) => Object.keys(l).sort().reduce((acc, next) => {
    const value = useValue ? lut[next] : next;
    const keys = next.split('.').filter(Boolean);

    let current = acc;
    keys.slice(0, keys.length - 1).forEach((key) => {
      if (typeof current[key] === 'undefined') {
        current[key] = {};
      }
      current = current[key];
    });

    const key = keys[keys.length - 1] || next;
    current[key] = value;
    return acc;
  }, {}),

  resetGetUniqueKeyFromFreeTextNumCalls: () => {
    LutManager.getUniqueKeyFromFreeTextNumCalls = 0;
  },
  incrementGetUniqueKeyFromFreeTextNumCalls: () => {
    LutManager.getUniqueKeyFromFreeTextNumCalls += 1;
  },

  // For testing
  clearLut: () => {
    lut = {};
  },
  setMaxLength: (ml) => {
    maxLength = ml;
  },
  clearMaxLength: () => {
    maxLength = DEFAULT_MAX_LENGTH;
  },
};
const getPathLabel = (slug) => {
  switch (slug) {
    case 'p':
      return 'paragraph';
    case 'a':
      return 'link';
    case 'ul':
    case 'ol':
      return 'list';
    case 'li':
      return 'item';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    default: return slug;
  }
};

const umlautMap = {
  Ü: 'UE',
  Ä: 'AE',
  Ö: 'OE',
  ü: 'ue',
  ä: 'ae',
  ö: 'oe',
  ß: 'ss',
};

function replaceUmlauts(str) {
  return str
    .replace(/[\u00dc|\u00c4|\u00d6][a-z]/g, (a) => {
      const big = umlautMap[a.slice(0, 1)];
      return big.charAt(0) + big.charAt(1).toLowerCase() + a.slice(1);
    })
    .replace(
      new RegExp(`[${Object.keys(umlautMap).join('|')}]`, 'g'),
      a => umlautMap[a],
    );
}

const lutToLanguageCodeHelper = (myLut) => {
  const content = LutManager.getKeys(true, myLut);
  const template = `const Keys = require('./keys');\n\nexport default ${JSON.stringify(content)};\n`;

  return template;
};
const camelToSnakeCase = str => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const isOverlapping = key => Object.keys(lut).find(k => k.startsWith(key) || key.startsWith(k));
const getUniqueKeyFromFreeText = (text, path = [''], suffix_ = '') => {
  const suffix = suffix_ && `.${suffix_}` || suffix_;
  // console.log(path);
  LutManager.incrementGetUniqueKeyFromFreeTextNumCalls();
  let maybeDuplicateKey = path.filter(Boolean).map(getPathLabel).map(str => camelToSnakeCase(str)
    .slice(0, maxLength)
    .replace(/[^a-zA-Z]+/g, ' ')
    .trim()
    .replace(/[^a-zA-Z]/g, '_')).join('.');
  maybeDuplicateKey = maybeDuplicateKey || '_';
  let key = maybeDuplicateKey;
  let overlappingCleared = false;
  let count = 1;
  // eslint-disable-next-line no-plusplus
  for (let i = 1; i < MAX_ITERATIONS; i++) {
    if (lut[key + suffix] === text) break;
    const overlapping = (!overlappingCleared && isOverlapping(key + suffix)) || undefined;
    if (lut[key + suffix] === undefined && !overlapping) break;
    if (overlapping) {
      // console.log('conflict', key, overlapping);
      if ((key + suffix).length > overlapping.length) {
        key = key.replace(overlapping, `of.${overlapping}`);
        maybeDuplicateKey = key;
        // eslint-disable-next-line no-continue
        continue;
      } else if (overlapping.length > (key + suffix).length) {
        key = `${key}.value`;
        maybeDuplicateKey = key;
        // eslint-disable-next-line no-continue
        continue;
      }
    }
    key = `${maybeDuplicateKey}${count}`;
    overlappingCleared = true;
    // eslint-disable-next-line no-plusplus
    count++;
  }
  lut[key + suffix] = text;

  return key + suffix;
};

module.exports = {
  getUniqueKeyFromFreeText,
  LutManager,
  lutToLanguageCodeHelper,
  randomChineseLutConverter,
};
