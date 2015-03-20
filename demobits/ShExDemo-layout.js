/*
*	DEMO HELPERS
*/


/**
 *	debugData
 *
 *	Pass me a data structure {} and I'll output all the key/value pairs - recursively
 *
 *	@example var HTML = debugData( oElem.style, "Element.style", { keys: "top,left,width,height", recurse: true, sort: true, display: true, returnHTML: true });	
 *
 *	@param Object	o_Data   A JSON-style data structure
 *	@param String	s_Title  Title for dialog (optional)
 *	@param Hash		options  Pass additional options in a hash
 */
function debugData (o_Data, s_Title, options) {
	options = options || {};
	var
		str=s_Title || 'DATA'
	//	maintain backward compatibility with OLD 'recurseData' param
	,	recurse=(typeof options=='boolean' ? options : options.recurse !==false)
	,	keys=(options.keys?','+options.keys+',':false)
	,	display=options.display !==false
	,	html=options.returnHTML !==false
	,	sort=options.sort !==false
	,	D=[], i=0 // Array to hold data, i=counter
	,	hasSubKeys = false
	,	k, t, skip, x	// loop vars
	;
	if (o_Data.jquery) {
		str=(s_Title ? s_Title+'\n':'')+'jQuery Collection ('+ o_Data.length +')\n    context="'+ o_Data.context +'"';
	}
	else if (o_Data.tagName && typeof o_Data.style == 'object') {
		str=(s_Title ? s_Title+'\n':'')+o_Data.tagName;
		var id = o_Data.id, cls=o_Data.className, src=o_Data.src, hrf=o_Data.href;
		if (id)  str+='\n    id="'+		id+'"';
		if (cls) str+='\n    class="'+	cls+'"';
		if (src) str+='\n    src="'+	src+'"';
		if (hrf) str+='\n    href="'+	hrf+'"';
	}
	else {
		parse(o_Data,''); // recursive parsing
		if (sort && !hasSubKeys) D.sort(); // sort by keyName - but NOT if has subKeys!
		str+='\n***'+'****************************'.substr(0,str.length);
		str+='\n'+ D.join('\n'); // add line-breaks
	}

	if (display) alert(str); // display data
	if (html) str=str.replace(/\n/g, ' <br>').replace(/  /g, ' &nbsp;'); // format as HTML
	return str;

	function parse ( data, prefix ) {
		if (typeof prefix=='undefined') prefix='';
		try {
			$.each( data, function (key, val) {
				k = prefix+key+':  ';
				skip = (keys && keys.indexOf(','+key+',') == -1);
				if (typeof val=='function') { // FUNCTION
					if (!skip) D[i++] = k +'function()';
				}
				else if (typeof val=='string') { // STRING
					if (!skip) D[i++] = k +'"'+ val +'"';
				}
				else if (typeof val !='object') { // NUMBER or BOOLEAN
					if (!skip) D[i++] = k + val;
				}
				else if (isArray(val)) { // ARRAY
					if (!skip) D[i++] = k +'[ '+ val.toString() +' ]'; // output delimited array
				}
				else if (val.jquery) {
					if (!skip) D[i++] = k +'jQuery ('+ val.length +') context="'+ val.context +'"';
				}
				else if (val.tagName && typeof val.style == 'object') {
					var id = val.id, cls=val.className, src=val.src, hrf=val.href;
					if (skip) D[i++] = k +' '+
						id  ? 'id="'+	id+'"' :
						src ? 'src="'+	src+'"' :
						hrf ? 'href="'+	hrf+'"' :
						cls ? 'class="'+cls+'"' :
						'';
				}
				else { // Object or JSON
					if (!recurse || !hasKeys(val)) { // show an empty hash
						if (!skip) D[i++] = k +'{ }';
					}
					else { // recurse into JSON hash - indent output
						D[i++] = k +'{';
						parse( val, prefix+'    '); // RECURSE
						D[i++] = prefix +'}';
					}
				}
			});
		} catch (e) {}
		function isArray(o) {
			return (o && typeof o==='object' && !o.propertyIsEnumerable('length') && typeof o.length==='number');
		}
		function hasKeys(o) {
			var c=0;
			for (x in o) c++;
			if (!hasSubKeys) hasSubKeys = !!c;
			return !!c;
		}
	}
};


/**
* showOptions
*
* Pass a layout-options object, and the pane/key you want to display
*/
function showOptions (o_Settings, key) {
	var data = o_Settings.options;
	$.each(key.split("."), function() {
		data = data[this]; // resurse through multiple levels
	});
	debugData( data, 'options.'+key );
}

/**
* showState
*
* Pass a layout-options object, and the pane/key you want to display
*/
function showState (o_Settings, key) {
	debugData( o_Settings.state[key], 'state.'+key );
}


/**************** in page ***************/
/*
 * complex.html
 *
 * This is a demonstration page for the jQuery layout widget
 *
 *	NOTE: For best code readability, view this with a fixed-space font and tabs equal to 4-chars
 */

	var outerLayout, innerLayout;

	/*
	*#######################
	*     ON PAGE LOAD
	*#######################
	*/
	function prepareLayout(resizeEditArea) {
	    // Mysterious hack to avoid non-fatal error:
	    //   jquery-layout-latest.js:5857: TypeError: Cannot set property 'pins' of undefined".
	    // after
	    //   var pane = $.layout.buttons.config.borderPanes[i];
	    // $.layout.buttons.config.borderPanes is set to "north,south,west,east" so pane is "n"
	    $.layout.buttons.config.borderPanes = ["north","south","west","east"];

	    layoutSettings_Outer.center__childOptions.onresize = resizeEditArea;
		// create the OUTER LAYOUT
		outerLayout = $("body").layout( layoutSettings_Outer );

		/*******************************
		 ***  CUSTOM LAYOUT BUTTONS  ***
		 *******************************
		 *
		 * Add SPANs to the east/west panes for customer "close" and "pin" buttons
		 *
		 * COULD have hard-coded span, div, button, image, or any element to use as a 'button'...
		 * ... but instead am adding SPANs via script - THEN attaching the layout-events to them
		 *
		 * CSS will size and position the spans, as well as set the background-images
		 */

		// BIND events to hard-coded buttons in the NORTH toolbar
		outerLayout.addToggleBtn( "#tbarToggleResults", "south" );
		outerLayout.addPinBtn( "#tbarPinExamples", "west" );
		outerLayout.addPinBtn( "#tbarPinControls", "east" );

		// save selector strings to vars so we don't have to repeat it
		// must prefix paneClass with "body > " to target ONLY the outerLayout panes
		var examplesSelector = "#examples"; // outer-west pane
		var controlsSelector = "#controls"; // outer-east pane

		 // CREATE SPANs for pin-buttons - using a generic class as identifiers
		$("<span></span>").addClass("pin-button").prependTo( examplesSelector );
		$("<span></span>").addClass("pin-button").prependTo( controlsSelector );
		// BIND events to pin-buttons to make them functional
		outerLayout.addPinBtn( examplesSelector +" .pin-button", "west");
		outerLayout.addPinBtn( controlsSelector +" .pin-button", "east" );

		 // CREATE SPANs for close-buttons - using unique IDs as identifiers
		$("<span></span>").attr("id", "examples-closer" ).prependTo( examplesSelector );
		$("<span></span>").attr("id", "controls-closer").prependTo( controlsSelector );
		// BIND layout events to close-buttons to make them functional
		outerLayout.addCloseBtn("#examples-closer", "west");
		outerLayout.addCloseBtn("#controls-closer", "east");

//	    layoutSettings_Inner.onresize =			resizeEditArea;
	        innerLayout = $("div.pane-center").layout( layoutSettings_Inner );
		// create tabs before wrapper-layout so elems are correct size before creating layout
		innerLayout.panes.east.tabs({
			activate:			$.layout.callbacks.resizeTabLayout
		});
	        // $("#data-tabs").tabs( "option", "active", "#first-tab" ); // doesn't work
		// tab content below tab switchs
		innerLayout.panes.east.layout({
			closable:			false
		,	resizable:			false
		,	spacing_open:		0
		,	center__onresize:	$.layout.callbacks.resizeTabLayout // tabs/panels are wrapped with an inner-layout
		});

		// DEMO HELPER: prevent hyperlinks from reloading page when a 'base.href' is set
		$("a").each(function () {
			var path = document.location.href;
			if (path.substr(path.length-1)=="#") path = path.substr(0,path.length-1);
			if (this.href.substr(this.href.length-1) == "#") this.href = path +"#";
		});

	        if (true) {
		    var ch = outerLayout.state.center.innerHeight;
		    outerLayout.sizePane("south", ch/2);
		}

		//$("#controls-accordion")	.accordion({ heightStyle: "fill" });
//	    innerLayout.onresize =			resizeEditArea;
	};


	/*
	*#######################
	* INNER LAYOUT SETTINGS
	*#######################
	*
	* These settings are set in 'list format' - no nested data-structures
	* Default settings are specified with just their name, like: fxName:"slide"
	* Pane-specific settings are prefixed with the pane name + 2-underscores: north__fxName:"none"
	*/
	layoutSettings_Inner = {
		applyDefaultStyles:			true		// basic styling for testing & demo purposes
	,	minSize:				20		// TESTING ONLY
	,	spacing_closed:				14
	,	fxName:					"slide"		// do not confuse with "slidable" option!
	,	fxSpeed_open:				1000
	,	fxSpeed_close:				2500
	,	fxSettings_open:			{ easing: "easeInQuint" }
	,	fxSettings_close:			{ easing: "easeOutQuint" }
	//,	initClosed:				true
	,	center__minWidth:			200
	,	center__minHeight:			200
	};


	/*
	*#######################
	* OUTER LAYOUT SETTINGS
	*#######################
	*
	* This configuration illustrates how extensively the layout can be customized
	* ALL SETTINGS ARE OPTIONAL - and there are more available than shown below
	*
	* These settings are set in 'sub-key format' - ALL data must be in a nested data-structures
	* All default settings (applied to all panes) go inside the defaults:{} key
	* Pane-specific settings go inside their keys: north:{}, south:{}, center:{}, etc
	*/
	var layoutSettings_Outer = {
		name: "outerLayout" // NO FUNCTIONAL USE, but could be used by custom code to 'identify' a layout
		// options.defaults apply to ALL PANES - but overridden by pane-specific settings
	,	defaults: {
			size:				"auto"
		,	minSize:			50
		,	paneClass:			"pane" 		// default = 'ui-layout-pane'
		,	resizerClass:			"resizer"	// default = 'ui-layout-resizer'
		,	togglerClass:			"toggler"	// default = 'ui-layout-toggler'
		,	buttonClass:			"button"	// default = 'ui-layout-button'
		,	contentSelector:		".content"	// inner div to auto-size so only it scrolls, not the entire pane!
		,	contentIgnoreSelector:		"span"		// 'paneSelector' for content to 'ignore' when measuring room for content
		,	togglerLength_open:		35		// WIDTH of toggler on north/south edges - HEIGHT on east/west edges
		,	togglerLength_closed:		35		// "100%" OR -1 = full height
		,	hideTogglerOnSlide:		true		// hide the toggler when pane is 'slid open'
		,	togglerTip_open:		"Close This Pane"
		,	togglerTip_closed:		"Open This Pane"
		,	resizerTip:			"Resize This Pane"
		//	effect defaults - overridden on some panes
		,	fxName:				"slide"		// none, slide, drop, scale
		,	fxSpeed_open:			100
		,	fxSpeed_close:			100
		,	fxSettings_open:		{ easing: "easeInQuint" }
		,	fxSettings_close:		{ easing: "easeOutQuint" }
		,	spacing_open:			4		// East's left size-bar width
	}
	,	north: {
			paneSelector:		"#resourceNav"
		,	spacing_open:			4		// cosmetic spacing
		,	togglerLength_open:		35		// HIDE the toggler button
		,	togglerLength_closed:		35		// "100%" OR -1 = full width of pane
		,	resizable: 			false
		,	slidable:			false
		,	fxName:				"none"
		,	initClosed:			true
		}
	,	south: {
			paneSelector:		"#results"
		//	could add a key control like this but it requires ctrl shift and blocks hard reload.
		//,	customHotkey:			"r"
		//,	enableCursorHotkey:		false
		,	spacing_closed:			4		// HIDE resizer & toggler when 'closed'
		,	slidable:			false		// REFERENCE - cannot slide if spacing_closed = 0
		,	initClosed:			true
		,	resizable: 			true
		}
	,	west: {
			paneSelector:			"#examples"
		,	size:				350
		,	spacing_closed:			21		// wider space when closed
		,	togglerLength_closed:		21		// make toggler 'square' - 21x21
		,	togglerAlign_closed:		"top"		// align to top of resizer
		,	togglerLength_open:		0		// NONE - using custom togglers INSIDE west-pane
		,	togglerTip_open:		"Close Examples Pane"
		,	togglerTip_closed:		"Open Examples Pane"
		,	resizerTip_open:		"Resize Examples Pane"
		,	slideTrigger_open:		"mouseover" 	// default
		,	initClosed:			true
		,	fxSettings_open:		{ easing: "easeOutQuint" }
		//,	onclose_start:			function (p1, p2, p3) { console.dir(p1); console.dir(p2); console.dir(p3); return true; }
		}
	,	east: {
			paneSelector:		"#controls"
		,	size:				500
		,	spacing_closed:			21		// wider space when closed
		,	togglerLength_closed:		21		// make toggler 'square' - 21x21
		,	togglerAlign_closed:		"top"		// align to top of resizer
		,	togglerLength_open:		0 		// NONE - using custom togglers INSIDE east-pane
		,	togglerTip_open:		"Close Controls Pane"
		,	togglerTip_closed:		"Open Controls Pane"
		,	resizerTip_open:		"Resize Controls Pane"
		,	slideTrigger_open:		"mouseover"
		,	initClosed:			false
		//	override default effect, speed, and settings
		,	fxName:				"drop"
		,	fxSpeed:			"normal"
		,	fxSettings:			{ easing: "" }	// nullify default easing
	        ,       onresize:			$.layout.callbacks.resizePaneAccordions
		}
	,	center: {
			paneSelector:			"#mainContent"	// sample: use an ID to select pane instead of a class
		,	minWidth:			200
		,	minHeight:			200
		}
	,	center__childOptions: {
			center__paneSelector:	"#schema"
		,	east__paneSelector:	"#data"
		,	enableCursorHotkey:		false		// don't hide Turtle frame.
		,	east__size:			500
		,	spacing_open:			4  // ALL panes
	        ,       onresize:			function (p1) { alert("resize " + p1 + " should have been overridden"); }
		}
	};

