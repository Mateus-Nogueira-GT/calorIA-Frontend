const React = require('react');
const { View } = require('react-native/Libraries/Components/View/View');

const NativeComponentMock = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref }),
);

NativeComponentMock.displayName = 'NativeComponentMock';

module.exports = NativeComponentMock;
module.exports.default = NativeComponentMock;
