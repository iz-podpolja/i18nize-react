const parserPlugins = [
  'jsx',
  'typescript',
  'classProperties', // '@babel/plugin-proposal-class-properties',
  'optionalChaining',
  'exportDefaultFrom',
];

const generatorOptions = {
  retainLines: true,
  retainFunctionParens: true,
};

module.exports = {
  parserPlugins,
  generatorOptions,
};
