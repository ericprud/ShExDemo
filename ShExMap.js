var assert = require("assert")
RDF = require('./RDF.js');
require('./ShExParser.js');
require('./TurtleParser.js');
var FS = require('fs')
var MAP = '<http://shexspec.github.io/extensions/Map/#>';

function walkShape (schema, shapeLabel, funcs) {
  if (!(shapeLabel in schema.ruleMap))
    throw new Error("shape \""+shapeLabel+"\" not found.");
  function _walkExpression (rule) {
    if (rule._ === 'AndRule') {
      rule.conjoints.forEach(function (conj) {
        _walkExpression(conj);
      });
    } else if (rule._ === 'AtomicRule') {
      if (rule.valueClass._ === 'ValueReference') {
        if (funcs.reference)
          funcs.reference(rule);
        walkShape(schema, rule.valueClass.label, funcs);
        if (funcs.endReference)
          funcs.endReference(rule);
      } else if (rule.valueClass._ === 'ValueType' ||
                 (rule.valueClass._ === 'ValueWild' &&
                  rule.valueClass.exclusions.length === 0)) {
        return funcs.variable ? funcs.variable(rule, rule.codes[MAP].code) : null;
      } else if (rule.valueClass._ === 'ValueSet' &&
                 rule.valueClass.values.length === 1) {
        var o = rule.valueClass.values[0];
        return funcs.constant ? funcs.constant(rule, o) : null;
      } else {
        throw new Error("rule \""+rule+"\" value class " + rule.valueClass._ + " not yet handled. Write some code.");
      }
    } else {
      throw new Error("rule \""+rule+"\" type " + rule._ + " not yet handled. Write some code.");
    }
  }
  _walkExpression(schema.ruleMap[shapeLabel]);
}

function resolveVarName (outputVar, iriResolver) {
  if (!outputVar)
    return undefined;
  outputVar = outputVar.replace(/ /g, '');
  if (outputVar.match(/^<[^>]+>$/)) {
    return iriResolver.getAbsoluteIRI(outputVar.substring(1, outputVar.length-2));
  } else {
    var m1 = outputVar.match(/^([^;]*):(.*)$/);
    return iriResolver.getAbsoluteIRI(iriResolver.getPrefix(m1[1]) + m1[2])
  }
}

function tryFileFunction (file, f) {
  var ret;
  try {
    var text = FS.readFileSync(file, 'utf8');
    return f(text);
  } catch (e) {
    function addFileInfo (e, filename) {
      try {
        var lineCol = '';
        if ('line' in e)
          lineCol += ':'+e.line;
        if ('column' in e)
          lineCol += ':'+e.column;
        if (lineCol)
          lineCol += ':';
        return filename + lineCol + ": error: " + e.toString();
      } catch (f) {
        return e; // can't add file info
      }
    }

    throw addFileInfo(e, file);
  }
  return ret;
}

function Mapper (fromFile, lib) {
  var knownVars = {};
  var schemaDetails = {};

  lib.forEach(function (toFile) {
    var toIRIResolver = RDF.createIRIResolver();
    var toSchema = tryFileFunction(toFile, function (text) {
      return ShExParser.parse(text, {iriResolver: toIRIResolver});
    });
    schemaDetails[toFile] = {
      schema: toSchema,
      iriResolver: toIRIResolver,
      vars: []
    };

    walkShape(toSchema, toSchema.startRule, {
      variable: function (rule, code) {
        var iri = resolveVarName(code, toIRIResolver);
        if (iri in knownVars)
          knownVars[iri].push(toFile);
        else
          knownVars[iri] = [toFile];
        if (!(iri in schemaDetails[toFile].vars))
          schemaDetails[toFile].vars.push(iri);
      }});
    // console.log(Object.keys(knownVars));
  });

  var mapVars = {};
  function _add (code, valRes, context) {
    mapVars[resolveVarName(code, fromIRIResolver)] = context.o;
  }

  var fromIRIResolver = RDF.createIRIResolver();
  var fromSchema = tryFileFunction(fromFile, function (text) {
    return ShExParser.parse(text, {iriResolver: fromIRIResolver});
  });

  return {
    tryFileFunction: tryFileFunction,
    materialize: function (inputFile) {
      var dataIRIResolver = RDF.createIRIResolver();
      var inputGraph = tryFileFunction(inputFile, function (text) {
        return TurtleParser.parse(text, {iriResolver: dataIRIResolver});
      });

      /** Validate input graph data with the fromSchema
       */
      fromSchema.alwaysInvoke = {};
      fromSchema.handlers = {};
      fromSchema.handlers[MAP] = {
        when: 1,
        begin: function (code, valRes, context) { _add(code, valRes, context); },
        post: function (code, valRes, context) { _add(code, valRes, context); }
      }

      var termResults = RDF.TermResults();
      var vs = RDF.ValidatorStuff(dataIRIResolver, false, false, termResults);
      var r = fromSchema.validate(inputGraph.slice(0,1)[0].s, fromSchema.startRule, inputGraph, vs, true);

      var outputGraph = RDF.Dataset();
      var bnodeScope = RDF.createBNodeScope();

      var neededVars = Object.keys(mapVars);
      while (neededVars.length) {
        var schemaName = knownVars[neededVars[0]];
        var targetSchema = schemaDetails[schemaName].schema;
        var targetIRIResolver = schemaDetails[schemaName].iriResolver;
        // console.log(schemaName);

        function freshBNode () {
          return RDF.BNode(bnodeScope.nextLabel(), RDF.Position0())
        }
        walkShape(targetSchema, targetSchema.startRule, {
          reference: function (rule) {
            var node = freshBNode();
            outputGraph.push(RDF.Triple(this._subjects.slice(-1)[0], rule.nameClass.term, node));
            this._subjects.push(node);
          },
          endReference: function (rule) {
            this._subjects.pop();
          },
          variable: function (rule, code) {
            var varname = resolveVarName(code, targetIRIResolver);
            var o = mapVars[varname];
            outputGraph.push(RDF.Triple(this._subjects.slice(-1)[0], rule.nameClass.term, o));
            neededVars = neededVars.filter(function (variable) {
              return variable !== varname;
            });
          },
          constant: function (rule, o) {
            outputGraph.push(RDF.Triple(this._subjects.slice(-1)[0], rule.nameClass.term, o));
          },
          _subjects: [freshBNode()]});
      }
      return outputGraph;
    }
  };
}

if (typeof require !== 'undefined' && typeof exports !== 'undefined')
  module.exports = Mapper; // node environment
else
  ShExMap = Mapper;
