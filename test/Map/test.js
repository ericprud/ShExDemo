#!/usr/bin/env node

var VERBOSE = "VERBOSE" in process.env;
RDF = require('../../RDF'); // ugly global for TurtleParser
require('../../TurtleParser.js'); // even worse
var Mapper = require('../../ShExMap');
var expect = require('chai').expect;

var maybeLog = VERBOSE ? console.log : function () {};

var Harness = {
  prepare: function (fromFile, lib, inputFile, expectFile) {
    var mapstr = fromFile + " -> " + lib.join(',');
    it('('+ mapstr + ')' + ' should map ' + inputFile + " to " + expectFile, function () {
      var map = Mapper(fromFile, lib);
      var outputGraph = map.materialize(inputFile);
      var expectGraph = map.tryFileFunction(expectFile, function (text) {
	return TurtleParser.parse(text, {iriResolver: RDF.createIRIResolver()});
      });
      maybeLog(mapstr);
      maybeLog("output:");
      maybeLog(outputGraph.toString());
      maybeLog("expect:");
      maybeLog(expectGraph.toString());
      // return {outputGraph:outputGraph, expectGraph:expectGraph};
      expect(outputGraph.equals(expectGraph)).to.be.true;
    });
  }
};

describe('A ShEx Mapper', function () {
  Harness.prepare(["BPFHIR.shex"], ["BPunitsDAM.shex"], "BPFHIR.ttl", "BPunitsDAM.ttl");
  Harness.prepare(["BPunitsDAM.shex"], ["BPFHIR.shex"], "BPunitsDAM.ttl", "BPFHIR.ttl");

  Harness.prepare(["BPFHIRsys.shex", "BPFHIRdia.shex"], ["BPunitsDAM.shex"], "BPFHIR.ttl", "BPunitsDAM.ttl");

/*
  Harness.prepare(["BPFHIR.shex"], ["BPunitsDAMsys.shex", "BPunitsDAMdia.shex"], "BPFHIR.ttl", "BPunitsDAM.ttl");

  emits:
    _:0 bpudam:systolic [
        bpudam:value "110"^^xsd:float.
        bpudam:units "mmHg" ] ;
        bpudam:diastolic _:2.
    _:3 bpudam:systolic _:4.
    _:3 bpudam:diastolic [
    _:5 bpudam:value "70"^^xsd:float.
    _:5 bpudam:units "mmHg" ] .

  instead of:
    _:b0 bpudam:diastolic [
        bpudam:value "70"^^xsd:float.
        bpudam:units "mmHg" ] ;
    _:b0 bpudam:systolic [
        bpudam:value "110"^^xsd:float.
        bpudam:units "mmHg" ] .

  where:
    PREFIX bpudam: <http://shexspec.github.io/extensions/Map/#BPunitsDAM->
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
*/
});
