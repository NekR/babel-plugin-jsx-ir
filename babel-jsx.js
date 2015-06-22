// Based on:
// https://github.com/babel/babel/blob/8b096ac7057379fd698eea3a33a2f77a8311a363/src/babel/transformation/helpers/build-react-transformer.js

var esutils = require('esutils');
var isIdentifierNameES6 = esutils.keyword.isIdentifierNameES6;
var helpers = require('./helpers');

// this.scope.hasBinding("name")` checks for local bindings
// this.scope.hasOwnBinding("name")` only checks the current scope
// this.scope.hasGlobal("name")`

module.exports = function(babel, options) {
  var t = babel.types;
  var captureScope = options && options.captureScope;
  var builtins = captureScope && options.builtins;

  return new babel.Transformer('jsx-ir', {
    JSXIdentifier: function (node) {
      if (node.name === 'this' && this.isReferenced()) {
        return t.thisExpression();
      } else if (isIdentifierNameES6(node.name)) {
        node.type = 'Identifier';
      } else {
        return t.literal(node.name);
      }
    },
    JSXNamespacedName: function(node) {
      return t.literal(node.namespace.name + ':' + node.name.name);
    },
    JSXMemberExpression: {
      exit: function(node) {
        node.computed = t.isLiteral(node.property);
        node.type = 'MemberExpression';
      }
    },
    JSXEmptyExpression: function (node) {
      node.type = 'Literal';
      node.value = null;
    },
    JSXExpressionContainer: function(node) {
      return node.expression;
    },
    JSXAttribute: {
      enter: function(node) {
        var value = node.value;

        if (t.isLiteral(value) && typeof value.value === 'string') {
          value.value = value.value.replace(/\n\s+/g, ' ');
        }
      },

      exit: function(node) {
        var name = node.name;
        var value = node.value || t.literal(true);

        return t.inherits(t.property('init', name, value), node);
      }
    },
    JSXOpeningElement: {
      exit: function(node, parent, scope, file) {
        var props = node.attributes;

        if (props.length) {
          // props = helpers.handleProps(props, scope, file, t);
          props = helpers.handleSpreadProps(props, scope, file, t);
        } else {
          props = t.literal(null);
        }

        var item;
        var tag;
        var getElementObject = function(tag) {
          return t.objectExpression([
            t.property('init', t.identifier('tag'), t.literal(tag)),
            t.property('init', t.identifier('props'), props)
          ])
        };

        if (captureScope && !t.isMemberExpression(node.name)) {
          if (t.isMemberExpression(node.name)) {
            // not supported yet
          } else {
            tag = node.name;

            if ('name' in tag && this.scope.hasBinding(tag.name) && !helpers.checkBuiltins(builtins, tag.name)) {
              item = t.callExpression(tag, [getElementObject(tag.name)]);
            } else {
              item = getElementObject(tag.name || tag.value);
            }
          }
        } else {
          if (t.isMemberExpression(node.name)) {
            node = node.name;
            tag = [];

            do {
              tag.push(node.property.name);
            } while (t.isMemberExpression(node = node.object));

            tag.push(node.name);
            tag = tag.join('.');
          } else {
            tag = node.name;
            tag = tag.name || tag.value;
          }

          item = getElementObject(tag);
        }

        return item;
      }
    },
    JSXElement: {
      exit: function(node) {
        var item = node.openingElement;
        var children = helpers.buildChildren(node.children, t);
        var object;

        children = children.length ? t.arrayExpression(children) : t.literal(null);

        if (t.isCallExpression(item)) {
          object = item.arguments[0];
        } else {
          object = item;
        }

        object.properties.push(
          t.property('init', t.identifier('children'), children)
        );

        return t.inherits(item, node);
      }
    },

    Expression: function(node, parent) {
      if (this.isCompletionRecord()) {
        // console.log(parent);
      }
    },
    Program: function(node) {
      // console.log(node);
    }
  });
};