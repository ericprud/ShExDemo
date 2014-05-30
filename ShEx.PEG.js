{
    function createStack () {
	var ret = [];
	ret.peek = function () { return this.slice(-1)[0]};
	ret.replace = function (elt) { this[this.length-1] = elt; };
	return ret;
    }
    var curSubject   = createStack();
    var curPredicate = createStack();
    var curListHead  = createStack();
    var curListTail  = createStack();
    var insertTripleAt = createStack(); // where to place (collection) triples for nice defaults
    var db = new RDF.DB();
    db.nextInsertAt = null;
    db.add = function (s, p, o) {
	var t = new RDF.Triple(s, p, o);
	if (this.nextInsertAt == null)
	    this.triples.push(t);
	else {
	    this.triples.splice(this.nextInsertAt, 0, t);
	    this.nextInsertAt = null;
	}
    }
    var RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    var XSD_NS = 'http://www.w3.org/2001/XMLSchema#'
    var iriResolver = ("iriResolver" in options) ? options.iriResolver : RDF.createIRIResolver();
    iriResolver.errorHandler = function (message) {
        throw peg$buildException(message, null, peg$reportedPos);
    };

    function _literalHere (value, type) {
	return new RDF.RDFLiteral(line(), column(), offset(), value.length, value, undefined,
				  new RDF.IRI(line(), column(), offset(), value.length, XSD_NS+type ));
    }

    var curSchema = new RDF.Schema();
    curSchema.db = db;
}
ShExDoc         = _ directive* _ssc_statement? {
    if (curSubject.length > 0 ||
	curPredicate.length > 0) {
	return {_: "Bad end state:",
		s:curSubject, 
		p:curPredicate, 
		t:db.triples.map(
		    function (t) { return t.toString(); }
		).join('\n')
	       };
    }
    // t:db.triples.map( function (t) { console.log(t.toString()); } )
    return curSchema;
}

_ssc_statement  = _ssc statement*
_ssc            = shape
                / start
                / m:CodeMap { curSchema.init = m; }
statement       = directive / start / shape
directive       = sparqlPrefix _ / sparqlBase _
sparqlPrefix    = SPARQL_PREFIX _ pre:PNAME_NS _ i:IRIREF { iriResolver.setPrefix(pre, i.lex); }
sparqlBase      = SPARQL_BASE _ i:IRIREF { iriResolver.setBase(i.lex); }

start           = 'start' _ '=' _ startRule
startRule       = l:label _ { curSchema.startRule = l; }
                / t:typeSpec _ m:CodeMap {
    var r = Object.keys(m).length ? new RDF.UnaryRule(line(), column(), t, false, m) : t;
    var b = RDF.nextBNode(line(), column(), offset(), 1);
    r.setLabel(b);
    curSchema.add(b, r);
    curSchema.startRule = b;
    return new RDF.ValueReference(line(), column(), b);
}

shape           = v:_VIRTUAL? l:label _ t:typeSpec _ m:CodeMap {
    var r = Object.keys(m).length ? new RDF.UnaryRule(line(), column(), t, false, m) : t;
    r.setLabel(l);
    curSchema.add(l, r);
    if (v)
        curSchema.markVirtual(r);
}
_VIRTUAL        = VIRTUAL _ { return true; }
typeSpec        = includes:include* '{' _ exp:OrExpression? _ '}' {
    // exp could be null if it's an empty (probably parent) rule.
    if (includes.length) {
        if (exp) { // includes, exp
            includes.forEach(function (p) {
                curSchema.hasDerivedShape(p.include, exp); // API reflects that we only care about parent->child map.
            });
            if (exp._ == 'AndRule') {
                exp.prepend(includes);
                return exp;
            } else {
                includes.push(exp);
                return new RDF.AndRule(line(), column(), includes);
            }
        } else { // includes, !exp
            // could set exp to new RDF.EmptyRule(line(), column()) above but end up with pointless disjoint.
            var ret = new RDF.AndRule(line(), column(), includes);
            includes.forEach(function (p) {
                curSchema.hasDerivedShape(p.include, ret); // API reflects that we only care about parent->child map.
            });
            return ret;
        }
    } else {
        if (exp) { // !includes, exp
            return exp;
        } else { // !includes, !exp
            return new RDF.EmptyRule(line(), column());
        }
    }
}
include = '&' _ l:label _  { return new RDF.IncludeRule(line(), column(), l); }

OrExpression    = exp:AndExpression _ more:disjoint* {
    if (!more.length) return exp;
    more.unshift(exp)
    return new RDF.OrRule(line(), column(), more);
}
disjoint = '|' _ exp:AndExpression _ { return exp; }
AndExpression   = exp:UnaryExpression _ more:conjoint* {
    if (!more.length) return exp;
    more.unshift(exp)
    return new RDF.AndRule(line(), column(), more);
}
conjoint = ',' _ exp:UnaryExpression _ { return exp; }
UnaryExpression = i:_id? a:arc {
    if (curSubject.length > 0)
        curSubject.pop();
    if (i) a.setRuleID(i); // in case it has an ID but no triples.
    return a;
}
                / inc:include { return inc; } // @@ default action sufficient?
                / i:_id? '(' _ exp:OrExpression _ ')' _ opt:'?'? _ c:CodeMap {
    if (curSubject.length > 0)
        curSubject.pop();
    if (!opt && !Object.keys(c).length) {
        if (i) exp.setRuleID(i); // in case it has an ID but no triples.
        return exp;
    }
    return new RDF.UnaryRule(line(), column(), exp, opt, c);
}
_id = '$' _ i:iri _ { curSubject.push(i); return i; }

label           = iri / BlankNode

arc             = a:('^' _ )? n:nameClass _ v:valueClass _ d:defahlt? _ r:repeatCount? _ p:properties? _ c:CodeMap {
    if (d)
        throw peg$buildException('default (='+d.toString()+') not currently supported', null, peg$reportedPos);
    var width = v.offset-offset()+v.width;
    if (r)
        width = r.ends-offset();
    else
        r = {min: 1, max: 1};
    var ret = new RDF.AtomicRule(line(), column(), offset(), width, a?true:false, n, v, r.min, r.max, c);
    if (p) ret.setRuleID(p);
    return ret;
}

nameClass       = _nmIriStem
                / i: RDF_TYPE { return new RDF.NameTerm(line(), column(), i); }
                / '.' _ excl:exclusions { return new RDF.NameWild(line(), column(), excl); }
_nmIriStem = i:iri patFlag:( _ '~')? {
    return patFlag ? new RDF.NamePattern(line(), column(), i) : new RDF.NameTerm(line(), column(), i);
}

valueClass      = '@' _ l:label { return new RDF.ValueReference(line(), column(), offset(), l.offset-offset()+l.width, l); }
                / r:typeSpec {
    var b = RDF.nextBNode(line(), column(), offset(), 1);
    r.setLabel(b);
    curSchema.add(b, r);
    return new RDF.ValueReference(line(), column(), offset(), 1, b); // Only hilight open brace.
}
                / t:nodeType { return new RDF.ValueType(line(), column(), offset(), t.width, t); }
                / n:iri { return new RDF.ValueType(line(), column(), offset(), n.width, n); }
                / s:valueSet { return new RDF.ValueSet(line(), column(), offset(), s.ends-offset(), s.list); }
                / '.' _ excl:exclusions { return new RDF.ValueWild(line(), column(), offset(), excl.ends-offset(), excl.list); }
nodeType        = IRI / LITERAL / BNODE / NONLITERAL
defahlt         = '=' o:(_iri_OR_literal) { return o; }
_iri_OR_literal = iri
                / literal

predicateObjectList = _ verb objectList (_ ';' _ (verb objectList)* )*
verb            = v:predicate { curPredicate.push(v); }
                / v:RDF_TYPE { curPredicate.push(v); }
predicate       = iri
objectList      = _ o:object oz:(_ ',' _ object)* { curPredicate.pop(); }

object = n:iri                   { db.add(curSubject.peek(), curPredicate.peek(), n); return n; }
       / n:BlankNode             { db.add(curSubject.peek(), curPredicate.peek(), n); return n; }
       / n:collection            { db.add(curSubject.peek(), curPredicate.peek(), n); return n; }
       / n:blankNodePropertyList { db.add(curSubject.peek(), curPredicate.peek(), n); return n; }
       / n:literal               { db.add(curSubject.peek(), curPredicate.peek(), n); return n; }

blankNodePropertyList = s:_lbracket predicateObjectList _ _rbracket { curSubject.pop(); return s; }
_lbracket       = '['            {
    var ret = RDF.nextBNode(line(), column(), offset(), 1);
    curSubject.push(ret);
    return ret;
}
_rbracket       = ']'

// Collections
collection      = _openCollection _ _members* r:_closeCollection                                 { return r; }
_openCollection = '('            {
    curListHead.push(null);
    curListTail.push(null);
    insertTripleAt.push(db.triples.length);
    curSubject.push(RDF.nextBNode(line(), column()-1, offset()-1, 1));
    curPredicate.push(new RDF.IRI(line(), column()  , offset()  , 1, RDF_NS+'first'));
}
_closeCollection= ')'            {
    curSubject.pop();
    curPredicate.pop();
    var nil = new RDF.IRI(line(), column()  , offset()  , 1, RDF_NS+'nil');
    if (curListHead.peek() != null) // got some elements
        db.add(curListTail.peek(),
               new RDF.IRI(line(), column()-1, offset()-1, 1, RDF_NS+'rest'),
               nil);
    db.nextInsertAt = insertTripleAt.pop();
    curListTail.pop();
    var ret = curListHead.pop();
    return (ret == null) ? nil : ret;
}
_members = o:object _           {
    var cur = curSubject.peek();
    if (curListHead.peek() == null)
        curListHead.replace(cur);
    else {
	db.nextInsertAt = db.triples.length-1;
        db.add(curListTail.peek(), // last tail
               new RDF.IRI(line(), column(), offset(), 1, RDF_NS+'rest'),
               cur);
	db.nextInsertAt = null;
    }
    var next = RDF.nextBNode(line(), o.column-2, o.offset-2, 1);
    curListTail.replace(cur);
    curSubject.replace(next);
    curPredicate.replace(new RDF.IRI(line(), o.column-1, o.offset-1, 1, RDF_NS+'first'));
}

// properties repeats blankNodePropertyList, but with different semantic actions
properties      = s:_lbracket1 predicateObjectList _ _rbracket1 { curSubject.pop(); return s; }
_lbracket1 = '[' {
    if (curSubject.length > 0)
        return curSubject.slice(-1)[0]; // curSubject was set by $_id rule
    var ret = RDF.nextBNode(line(), column(), offset(), 1);
    curSubject.push(ret);
    return ret;
}
_rbracket1 = ']'

exclusions      = ex:_excl* { return ex.length ? {ends: ex[ex.length-1].offset+ex[ex.length-1].width , list:ex} : {ends:offset(), list:[]}; }
_excl = '-' _ i:iri _ { return i; }

repeatCount     = '*' { return {min: 0, max: undefined, ends: offset()+1}; }
                / '+' { return {min: 1, max: undefined, ends: offset()+1}; }
                / '?' { return {min: 0, max: 1, ends: offset()+1}; }
                / _openBRACE min:INTEGER _ max:_max? _ c:_closeBRACE { return {min: min.value, max: max, ends: c}; }
_openBRACE = '{'
_closeBRACE = '}' { return offset()+1; }
_max = ',' _ max:INTEGER? { return max ? max.value : undefined; }
valueSet        = _openPAREN _ o:( p:_values )+ c:_closePAREN { return {ends:c, list:o}; }
_openPAREN = '('
_closePAREN = ')' { return offset()+1; }
_values = o:valueChoice _ { return o; } // strip out whitespace

CodeMap         = codeList:_codePair* {
    var ret = {};
    for (var i = 0; i < codeList.length; ++i)
        ret[codeList[i].label] = codeList[i];
    return ret;
}
_codePair = c:CODE _ { return c; }

_objIriStem      = i:iri patFlag:( _ TILDE)? {
    return patFlag
        ? new RDF.ValuePattern(line(), column(), offset(), patFlag[1]-offset(), i)
        : new RDF.ValueType(line(), column(), offset(), i.width, i);
}
TILDE = '~' { return offset()+1; }

valueChoice     = _objIriStem
                / b:BlankNode { return new RDF.ValueType(line(), column(), offset(), b.width, b); }
                / l:literal { return new RDF.ValueType(line(), column(), offset(), l.width, l); }


// Literals
literal        = RDFLiteral / NumericLiteral / BooleanLiteral
NumericLiteral = value:DOUBLE  { return _literalHere(value, 'double'); }
               / value:DECIMAL { return _literalHere(value, 'decimal'); }
               / value:INTEGER { return _literalHere(value, 'integer'); }
RDFLiteral     = s:String l:LANGTAG { return new RDF.RDFLiteral(s.line, s.column, s.offset,
								s.length+1, s.lex, l, undefined); }
               / s:String '^^' i:iri { return new RDF.RDFLiteral(s.line, s.column, s.offset,
								 s.length+2+i.width, s.lex, undefined, i); }
               / s:String      { return new RDF.RDFLiteral(s.line, s.column, s.offset, s.length,
							   s.lex, undefined, undefined); }
BooleanLiteral = 'true' / 'false'
String = STRING_LITERAL_LONG1 / STRING_LITERAL_LONG2 / STRING_LITERAL1 / STRING_LITERAL2

// IRIs
iri = IRIREF / PrefixedName
PrefixedName = ln:PNAME_LN {
    return new RDF.IRI(line(), column(), offset(), ln.width,
                       iriResolver.getAbsoluteIRI(iriResolver.getPrefix(ln.prefix) + ln.lex));
}
    / p:PNAME_NS { return new RDF.IRI(line(), column(), offset(), p.length+1, iriResolver.getAbsoluteIRI(iriResolver.getPrefix(p))); }
BlankNode = BLANK_NODE_LABEL / ANON

// Terminals:
CODE = '%' label:([a-zA-Z+#_][a-zA-Z0-9+#_]*)? '{' code:([^%\\] / '\\' '%')* '%' '}' {
    return new RDF.Code(line(), column(), offset(), 1+label.length+1+code.length+2, label[0]+label[1].join(''), code.join(''));
}

VIRTUAL = [Vv][Ii][Rr][Tt][Uu][Aa][Ll]

IRI = [Ii][Rr][Ii] { return new RDF.IRI(line(), column(), offset(), 3, 'http://www.w3.org/2013/ShEx/ns#IRI'); }
LITERAL = [Ll][Ii][Tt][Ee][Rr][Aa][Ll] { return new RDF.IRI(line(), column(), offset(), 3, 'http://www.w3.org/2013/ShEx/ns#Literal'); }
BNODE = [Bb][Nn][Oo][Dd][Ee] { return new RDF.IRI(line(), column(), offset(), 3, 'http://www.w3.org/2013/ShEx/ns#BNode'); }
NONLITERAL = [Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll] { return new RDF.IRI(line(), column(), offset(), 3, 'http://www.w3.org/2013/ShEx/ns#NonLiteral'); }

RDF_TYPE = 'a' { return new RDF.IRI(line(), column(), offset(), 1, RDF_NS+'type'); }

IRIREF = b:_IRIREF_BEGIN s:([^\u0000-\u0020<>\"{}|^`\\] / UCHAR)* e:_IRIREF_END {
    return new RDF.IRI(line(), column(), offset(), e-b+1, iriResolver.getAbsoluteIRI(s.join('')))
}
_IRIREF_BEGIN = '<' { return offset(); }
_IRIREF_END = '>' { return offset(); }

SPARQL_PREFIX = [Pp][Rr][Ee][Ff][Ii][Xx]
SPARQL_BASE = [Bb][Aa][Ss][Ee]
PNAME_NS = pre:PN_PREFIX? ':' { return pre ? pre : '' } // pre+'|' : '|';
PNAME_LN = pre:PNAME_NS l:PN_LOCAL { 
    return {width: pre.length+1+1+l.length, prefix:pre, lex:l};
}

BLANK_NODE_LABEL = '_:' first:[a-zA-Z_] rest:[a-zA-Z0-9_]* {
    return new RDF.BNode(line(), column(), offset(), 2+first.length+rest.length, first+rest.join(''));
}
LANGTAG          = '@' s:([a-zA-Z]+ ('-' [a-zA-Z0-9]+)*) {
    s[1].splice(0, 0, '');
    var str = s[0].join('')+s[1].reduce(function(a,b){return a+b[0]+b[1].join('');});
    return new RDF.LangTag(line(), column()+1, offset()+1, str.length, str);
}
INTEGER          = sign:[+-]? s:[0-9]+ { if (!sign) sign=''; return sign+s.join(''); }
DECIMAL          = sign:[+-]? l:[0-9]* '.' d:[0-9]+ { if (!sign) sign=''; return sign+l.join('')+'.'+d.join(''); }
DOUBLE           = sign:[+-]? v:_DOUBLE_VAL { if (!sign) sign=''; return sign+v; }
_DOUBLE_VAL      = m:[0-9]+ '.' d:[0-9]* e:EXPONENT { return m.join('')+'.'+d.join('')+e; }
                 / '.' d:[0-9]+ e:EXPONENT { return '.'+d.join('')+e; }
                 / m:[0-9]+ e:EXPONENT { return m.join('')+e; }
EXPONENT         = e:[eE] sign:[+-]? l:[0-9]+ { if (!sign) sign=''; return e+sign+l.join(''); }
STRING_LITERAL1  = b:_STRING_LITERAL1_DELIM s:_NON_1* e:_STRING_LITERAL1_DELIM { return {line:line(), column:column(), offset:offset(), length:e-b+1, lex:s.join('')}; }
_STRING_LITERAL1_DELIM = "'" { return offset(); }
_NON_1 = [^\u0027\u005C\u000A\u000D] / ECHAR / UCHAR
STRING_LITERAL2  = b:_STRING_LITERAL2_DELIM s:_NON_2* e:_STRING_LITERAL2_DELIM { return {line:line(), column:column(), offset:offset(), length:e-b+1, lex:s.join('')}; }
_STRING_LITERAL2_DELIM = '"' { return offset(); }
_NON_2 = [^\u0022\u005C\u000A\u000D] / ECHAR / UCHAR
STRING_LITERAL_LONG1 = b:_STRING_LITERAL_LONG1_DELIM s:_NON_LONG1* e:_STRING_LITERAL_LONG1_DELIM { return {line:line(), column:column(), offset:offset(), length:e-b+3, lex:s.join('')}; }
_STRING_LITERAL_LONG1_DELIM = "'''" { return offset(); }
_NON_LONG1 = q:_LONG1? c:[^'\\] { // '
    return q ? q+c : c;
}
           / ECHAR / UCHAR
_LONG1 = "''" / "'"
STRING_LITERAL_LONG2 = b:_STRING_LITERAL_LONG2_DELIM s:_NON_LONG2* e:_STRING_LITERAL_LONG2_DELIM { return {line:line(), column:column(), offset:offset(), length:e-b+3, lex:s.join('')}; }
_STRING_LITERAL_LONG2_DELIM = '"""' { return offset(); }
_NON_LONG2 = q:_LONG2? c:[^"\\] { // "
    return q ? q+c : c;
}
           / ECHAR / UCHAR
_LONG2 = '""' / '"'
UCHAR            = '\\u's:(HEX HEX HEX HEX) { return String.fromCharCode(parseInt(s.join(''), 16)); }
    / '\\U's:(HEX HEX HEX HEX HEX HEX HEX HEX) {
    var code = parseInt(s.join(''), 16);
    if (code<0x10000) { // RDFa.1.2.0.js:2712
        return String.fromCharCode(code);
    } else {
        // Treat this as surrogate pairs until use cases for me to push it up to the toString function. (sigh)
        var n = code - 0x10000;
        var h = n >> 10;
        var l = n & 0x3ff;
        return String.fromCharCode(h + 0xd800) + String.fromCharCode(l + 0xdc00);
    }
}
ECHAR = '\\' r:[tbnrf"'\\] { // "
    return r=='t' ? '\t'
         : r=='b' ? '\b'
         : r=='n' ? '\n'
         : r=='r' ? '\r'
         : r=='f' ? '\f'
         : r=='"' ? '"'
         : r=='\'' ? '\''
         : '\\'
}
ANON             = '[' s:_ ']' { return RDF.nextBNode(line(), column(), offset(), s.length+2); }
PN_CHARS_BASE = [A-Z] / [a-z]
PN_CHARS_U = PN_CHARS_BASE / '_'
PN_CHARS = PN_CHARS_U / '-' / [0-9]
PN_PREFIX = b:PN_CHARS_BASE r:PN_PREFIX2? { return r ? b+r : b; }
PN_PREFIX2 = l:'.' r:PN_PREFIX2 { return l+r; }
           / l:PN_CHARS r:PN_PREFIX2? { return r ? l+r : l; }

PN_LOCAL = l:(PN_CHARS_U / ':' / [0-9] / PLX) r:PN_LOCAL2?
{ return r ? l+r : l; }
PN_LOCAL2 = l:'.' r:PN_LOCAL2 { return l+r; }
          / l:PN_CHARS_colon_PLX r:PN_LOCAL2? { return r ? l+r : l; }
PN_CHARS_colon_PLX = PN_CHARS / ':' / PLX
PLX = PERCENT / PN_LOCAL_ESC
PERCENT = '%' l:HEX r:HEX { return '%'+l+r; }
HEX = [0-9] / [A-F] / [a-f]
PN_LOCAL_ESC = '\\' r:[_~.!$&'()*+,;=/?#@%-] { return r; }

_ = x:(WS / COMMENT)* { return ''; }
WS               = [ \t\r\n]+ { return ''; }
COMMENT          =  "#" comment:[^\r\n]* { return new RDF.Comment(line(), column(), offset(), comment.length+1, comment.join('')); }
// [/terminals]
