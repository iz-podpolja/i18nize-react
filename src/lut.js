const randChinese = require('randchinese');

const MAX_ITERATIONS = 1000;

let lut = {};

const DEFAULT_MAX_LENGTH = 30;
let maxLength = DEFAULT_MAX_LENGTH;

const lutToLanguageCodeHelper = (myLut) => {
  const kvToCode = (key, value) => `  [k.${key}]: \`${value}\``;
  const lines = Object.keys(myLut)
    .map(key => kvToCode(key, myLut[key]))
    .join(',\n');
  const template = `const Keys = require('./keys');\n\nexport default {\n${lines}\n};\n`;

  return template;
};

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
  getKeys: () => Object.keys(lut).reduce((acc, next) => ({ ...acc, [next]: next }), {}),

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

const getUniqueKeyFromFreeText = (text, path = ['']) => {
  LutManager.incrementGetUniqueKeyFromFreeTextNumCalls();
  const sanitized = replaceUmlauts(text);
  let maybeDuplicateKey = [...path, sanitized
    .toLowerCase()
    .slice(0, maxLength)
    .replace(/[^a-zA-Z]+/g, ' ')
    .trim()
    .replace(/[^a-zA-Z]/g, '_')].filter(Boolean).join('.');
  maybeDuplicateKey = maybeDuplicateKey.length ? maybeDuplicateKey : '_';
  let key = maybeDuplicateKey;
  for (let i = 1; i < MAX_ITERATIONS; i += 1) {
    if (lut[key] === text || lut[key] === undefined) break;
    key = `${maybeDuplicateKey}${i}`;
  }
  lut[key] = text;

  return key;
};

module.exports = {
  getUniqueKeyFromFreeText,
  LutManager,
  lutToLanguageCodeHelper,
  randomChineseLutConverter,
};
