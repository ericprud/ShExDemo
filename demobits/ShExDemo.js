//


ShExDemo = function() {
    var TIMEOUT = 500;
    var KB      = 1024;
    var MS_IN_S = 1000;

    var timers  = [null, null, null]
    var SCHEMA  = 1;
    var DATA    = 2;
    var VALPARM = 3;

    var last    = {}; // Save input values to avoid needless re-execution.

    function setHandler(elts, handler) {
        elts.change(handler).mousedown(handler).mouseup(handler)
            .click(handler).keydown(handler).keyup(handler).keypress(handler);
            // .blur(handler).paste(handler).copy(handler).cut(handler)
    }

    /* Fancy execution time from http://pegjs.majda.cz/online */
    function buildSizeAndTimeInfoHtml(title, size, units, time) {
        return $("<span/>", {
            "class": "size-and-time",
            title:   title,
            html:    (size).toPrecision(2) + "&nbsp;" + units + ", "
                + time + "&nbsp;ms, "
                + ((size) / (time / MS_IN_S)).toPrecision(2) + "&nbsp;" + units + "/s"
        });
    }

    function buildErrorMessage(e, id, label) {
        var ret = null;
        if (typeof(e) == 'object') {
            var text = "";
            var errorMarkerId = null;
            if ('offset' in e && $("#ctl-colorize").is(":checked")) {
                var now = textValue(id);
                var element = $(id + " pre").get(0);
                var textMap = new CharMap(now);
                textMap.HTMLescape();
                errorMarkerId = label + "-error1";
                textMap.insertAfter(e.offset, "<span class='parseError' id='"+errorMarkerId+"'>", 0);
                textMap.insertAfter(e.offset, "</span>", 0);
                element.innerHTML = textMap.getText();
            }
            if ('line' in e) text += "Line " + e.line + " ";
            if ('column' in e) text += "Column " + e.column + " ";
            if ('message' in e) text += e.message;
            else text += e;

            if ('stack' in e && e.stack) // ff has an empty string
                ret = $("<a href='#' class='hasToolTip'>"+text
                        + "<span class='toolTip wide'>"
                        + e.stack
                        + "</span></a>");
            else
                ret = $("<div>"+text+"</div>");
            if (errorMarkerId)
                ret
                .mouseenter(function (event) {debugger; $("#"+errorMarkerId).addClass("highlightError");})
                .mouseleave(function (event) {debugger; $("#"+errorMarkerId).removeClass("highlightError");});
        } else {
            ret = document.createTextNode(e);
        }
        return ret;
    }

    function enableValidatorLink() {
        $("#validation .now").removeAttr("disabled");
    }

    function sanitizeEditable (element) {
        if (element.innerHTML.search(/<div>|<br>|&nbsp;/) != -1)
            element.innerHTML = element.innerHTML
                .replace(/<div>/g, "\n").replace(/<\/div>/g, "") // chromium
                .replace(/<br>/g, "\n")                          // firefox
                .replace(/&nbsp;/g, " ")                         // nbsps in pirate pad
                                                                 // ...?
            ;
    }

    function textValue (id, newValue, fromPre) {
        if (fromPre === undefined)
            fromPre = $("#ctl-colorize").is(":checked");
        var ret;

        if (fromPre) {
            var element = $(id + " pre").get(0);
            sanitizeEditable(element);
            ret = $(id + " pre").text(); // element.innerText
            if (newValue !== undefined)
                $(id + " pre").text(newValue); // element.innerText = newValue;
        } else {
            ret = $(id + " textarea.textInput").val();
            if (newValue !== undefined)
                $(id + " textarea.textInput").val(newValue);
        }
        return ret;
    }

    // HTML escape.
    function HEsc (s) {
        return $('<div/>').text(s).html();
    }

    // Interface object.
    // Can be used with just 
    //   $(document).ready(ShExDemo(RDF).loadAndStart());
    // or one can populate the panes before calling
    //   iface.allDataIsLoaded();
    var iface = {
        schema: null, validator: null, // intuitive alias for schema.obj
        data: null, graph: null,       // intuitive alias for data.obj
        queryParms: {},
        lastKeyDownTime: 0,
        GenXwindow: undefined,
        GenJwindow: undefined,
        GenNwindow: undefined,
        GenRwindow: undefined,
        dataSources: { Text: 1, Query: 2 },
        dataSource: 1, // Text
        curSolnSetIDPrefix: null,

        // Logging utilities
        status: function (m, target) {
            var target = target || "#validation .now";
            var elt = $("<span>"+$('<div/>').text(m).html()+"</span>");
            $(target).empty().append(elt).append("<br/>");
            return elt;
        },
        message: function (m, target) {
            var target = target || "#validation .log";
            var elt = $("<span>"+$('<div/>').text(m).html()+"</span>");
            $(target).append(elt).append("<br/>");
            return elt;
        },
        error: function (m, target) {
            var target = target || "#validation .log";
            var elt = $("<span>"+$('<div class="error"/>').text(m).html()+"</span>");
            $(target).append(elt).append("<br/>");
            return elt;
        },

        // setup popup stuff
        deselectPopup: function (e) {
            $('.pop').slideFadeToggle(function() {
                e.removeClass('selected');
                $("#pcontent").empty();
            });
        },

        parseMessage: function (selector) {
            return {
                removeClass: function (classes) {
                    $(selector).removeClass(classes);
                    return this;
                },
                addClass: function (classes) {
                    $(selector).addClass(classes);
                    return this;
                },
                empty: function () {
                    $(selector).empty();
                    return this;
                },
                append: function (text) {
                    $(selector).append(text);
                    return this;
                },
                text: function (text) {
                    $(selector).text(text);
                    return this;
                },
                html: function (html) {
                    $(selector).html(html);
                    return this;
                }
            };
        },

        // Simplest entry point for the ShExDemo.
        loadAndStart: function () {

            // control validation input
            $("#settings input[name='mode']").change(function () {
                if ($("#opt-pre-typed").is(":checked"))
                    $("#starting-nodes").removeAttr("disabled");
                else
                    $("#starting-nodes").attr("disabled", "disabled");
            }).change(); // .change() needed?

            // update history when keep-history is turned on
            $("#ctl-keep-history").change(function () {
                if (this.checked)
                    window.history.pushState(null, null, $("#permalink a").attr("href"));
            });

            // colorization switch
            $("#ctl-colorize").change(function () {
                if (this.checked)
                    iface.enablePre();
                else
                    iface.enableTextarea();
            });

            // fancy node select: http://www.erichynds.com/blog/jquery-ui-multiselect-widget
            // helper function to update the menu based on whether the nested input in checked.
            function highlightMenu () {
                $(".ui-multiselect-menu .ui-corner-all").slice(1).each(
                    function (ord, elt) {
                        if ($(elt).find("input").is(':checked'))
                            $(elt).addClass("highlightTerms");
                        else
                            $(elt).removeClass("highlightTerms");
                    }
                );
            }

            // highlight selected node in data
            function highlightData (labels, clsName, isOn, time) {
                if ($("#ctl-colorize").is(":checked") && labels) // might be null instead of []
                    for (var iLabel = 0; iLabel < labels.length; ++iLabel) {
                        var label = labels[iLabel];
                        var ids = iface.data.termStringToIds.get(label);
                        if (ids)
                            for (var i = 0; i < ids.length; ++i) {
                                if (isOn)
                                    $("#"+ids[i]).addClass(clsName, time);
                                else
                                    $("#"+ids[i]).removeClass(clsName, time);
                            }
                    }
            }

            // invocation of multiselect with callbacks to set classes.
            $("#starting-nodes").multiselect({
                checkAllText: "select all",
                uncheckAllText: "deselect all",
                noneSelectedText: "select node(s) to validate",
                selectedText: "# of # nodes",
                selectedList: 2,
                open: function () {
                    // highlight the already-selected nodes
                    highlightData($("#starting-nodes").val(), "ui-state-hover", true, 0);
                    highlightMenu();

                    // add enter/leave callbacks
                    $(".ui-multiselect-menu .ui-corner-all").slice(1).map(
                        function (idx, elt) {
                            $(elt)
                                .mouseenter(
                                    function (event) {
                                        highlightData([$(event.target).text()], "highlightTerms", true, 0);
                                    })
                                .mouseleave(
                                    function (event) {
                                        highlightData([$(event.target).text()], "highlightTerms", false, 0);
                                    });
                        });
                },
                click: function (event, ui) {
                    // select data nodes and menu item
                    highlightData([ui.text], "ui-state-hover", ui.checked, 50);
                    highlightMenu();
                },
                close: function () {
                    // initiates validation
                    // get all labels from the select.
                    var labels = $("#starting-nodes option").map(function (ord, elt) { return $(elt).text(); })
                    highlightData(labels, "ui-state-hover", false, 0);
                    $("#settings input[name='mode']").change();
                },
                checkAll: function() {
                    // the slave input is updated before checkAll is called
                    highlightData($("#starting-nodes").val(), "ui-state-hover", true, 0);
                    highlightMenu();
                },
                uncheckAll: function() {
                    // get all labels from the select.
                    var labels = $("#starting-nodes option").map(function (ord, elt) { return $(elt).text(); })
                    highlightData(labels, "ui-state-hover", false, 0);
                    highlightMenu();
                },
            });

                // .bind("multiselectclick multiselectcheckall multiselectuncheckall", function( event, ui ){
                //     console.dir(event); console.dir(ui);
                //     var checkedValues = $.map($(this).multiselect("getChecked"), function( input ){
                //         return input.value;
                //     });
                //     console.log(checkedValues.length
                //                 ? checkedValues.join(', ')
                //                 : 'Please select a checkbox');
                // })
                // .triggerHandler("multiselectclick"); // trigger above logic when page first loads

            // Update saved state when any link is clicked.
            $("a").click( function() {
                $("#schema .save").val(escape(textValue("#schema")));
                $("#data .save"  ).val(escape(textValue("#data"  )));
            } );

            // Reload saved state if there is one.
            //   Used when following link out and then back up to this page.
            if ($("#schema .save").val()) {
                textValue("#schema", unescape($("#schema .save").val()));
                textValue("#data"  , unescape($("#data   .save").val()));
                iface.allDataIsLoaded();
            }

            // Else if the input fields have text, keep that text.
            //   Used when using tab history and then returning to this page.
            else if (textValue("#schema") != "" && textValue("#data") != "") {
                iface.allDataIsLoaded();
            }

            // Else load any data specified in the URL.
            else {
                var parseQueryString = function(query) {
                    if (query[0]==='?') query=query.substr(1); // optional leading '?'
                    var map   = {};
                    query.replace(/([^&,=]+)=?([^&,]*)(?:[&,]+|$)/g, function(match, key, value) {
                        key=decodeURIComponent(key);value=decodeURIComponent(value);
                        (map[key] = map[key] || []).push(value);
                    });
                    return map;
                };
                iface.queryParms = parseQueryString(location.search);

                function getTargetContentPromise (elt, into) {
                    return Promise.resolve($.ajax({ type: 'GET', dataType: "text", url: elt })) // add , contentType: "text/plain" to eliminate OPTIONS query?
                        .then(function (body) {
                            return {url:elt, into:into, body:body, errorStr:null, errorMouseover:null};
                        }).catch(function (jqXHR) {
                            // @@ show  with mouseenter?
                            var m = null;
                            if (window.location.origin == "file://" && jqXHR.status == 0)
                                m = jqXHR.statusText.match("^NetworkError: Failed to execute 'send' on 'XMLHttpRequest': Failed to load 'file:///([^']+)'\\.$");
                            var errorStr = m ?
                                "Your browser didn't load local file /"+m[1]+"; click the error message or try firefox." :
                                "GET " + elt + " returned " + jqXHR.status + " " + jqXHR.statusText;
                            return {url:elt, into:into, body:"# !! " + errorStr + "\n",
                                    errorStr: errorStr, errorMouseover:jqXHR.responseText};
                        });
                }

                Promise.all((iface.queryParms['schemaURL'] || []).map(function (elt) {
                    // Iterate schema URLs
                    // Loading non-endorsed schema links disables javascript extensions.
                    if (/^([a-z]+:)?\/\//g.test(elt))
                        $('#opt-disable-js').attr('checked', true);
                    return getTargetContentPromise(elt, "#schema");
                }).concat(((iface.queryParms['dataURL'] || [])).map(function (elt) {
                    // Iterate data URLs
                    // You can load any data (modulo CORS).
                    return getTargetContentPromise(elt, "#data");
                })))
                // When all are loaded
                    .then(function (components) {
                        // Iterate [target,content]s:
                        // [['#schema', "shex1"],['#data', "turtle1"],['#data', "turtle2"]
                        components.forEach(function(c) {
                            // load into their targets.
                            textValue(c.into, textValue(c.into)+c.body);
                            if (c.errorStr) {
                                var elt = $("<a href='"+c.url+"'>"+c.errorStr+"</a><br/>").addClass("error small");

                                // Popup with error contents -- disabled for now.
                                if (false && c.errorMouseover) {
                                    elt.on('click', function() {
                                        if($(this).hasClass('selected')) {
                                            iface.deselectPopup($(this));
                                        } else {
                                            $(this).addClass('selected');
                                            $("#pcontent").html(c.errorMouseover);
                                            $('.pop').slideFadeToggle();
                                        }
                                        $('.pop').on('click', function() {
                                            iface.deselectPopup(elt);
                                            return false;
                                        });
                                        return false;
                                    });
                                }
                                iface.parseMessage(c.into+" .log").append(elt);

                        // $("#start-rule").text(startRuleText)
                        // .mouseenter(function () {
                        //     $(this).addClass("ui-state-hover", 50);
                        //     if ($("#ctl-colorize").is(":checked"))
                        //         iface.schema.termStringToIds.get(startRuleText).map(function (id) { $("#"+id).addClass("ui-state-hover", 50) })
                        // })
                        // .mouseleave(function () {
                        //     $(this).removeClass("ui-state-hover", 50);
                        //     if ($("#ctl-colorize").is(":checked"))
                        //         iface.schema.termStringToIds.get(startRuleText).map(function (id) { $("#"+id).removeClass("ui-state-hover", 50) })
                        // });

                            }
                        });
                    }).catch(function(err) {
                        alert("Completely unexpected error loading data: \""+err+"\nPlease file a bug with the URL that produced this error");
                    }).then(function() {
                        iface.loadDirectData();
                    });
            }
        },

        // Update the location bar with the new content.
        updateURL: function() {
            var attrs = Object.keys(iface.queryParms);
            var s = '?' + attrs.map(function(attr) {
                return iface.queryParms[attr].map(function (val) {
                    return encodeURIComponent(attr)+"="+encodeURIComponent(val);
                }).join('&');
            }).join('&');
            $("#permalink a").attr("href", location.pathname+s);
            if ($("#ctl-keep-history").is(":checked"))
                window.history.pushState(null, null, location.origin+location.pathname+s);
        },

        // Load data encoded in URL.
        loadDirectData: function() {
            if (iface.queryParms['schema'])
                iface.queryParms['schema'].forEach(function(s) {
                    // Loading literal schema disables javascript extensions.
                    $('#opt-disable-js').attr('checked', true);
                    textValue("#schema", $("#schema .textInput").val()+s);
                });
            if (iface.queryParms['data'])
                iface.queryParms['data'].forEach(function(s) {
                    textValue("#data", $("#data .textInput").val()+s);
                });

            // Query parms will be rebuilt on event timeouts.
            iface.allDataIsLoaded();
        },
        loadSPARQLResults: function (query, sparqlInterface, cacheSize) {
            function idle (parm) {
                if ($("#opt-async").is(":checked"))
                    return new Promise(function (resolve) {
                        window.setTimeout(function () {
                            resolve(parm);
                        }, 0);
                    });
                else
                    return parm;
            }
            var endpoint = sparqlInterface.getURL();
            iface.disableValidatorOutput();
            iface.parseMessage("#data .now").addClass("progress")
                .text("Loading nodes from " + endpoint + "...");

            function notifySearchingNodes (r) {
                iface.parseMessage("#data .now").addClass("progress")
                    .text("Finding unique nodes in "+r.solutions.length+" results...");
                return idle(r);
            }

            function searchNodes (r) {
                var nodes = [];
                var m = {};
                r.solutions.forEach(function (soln) {
                    if (r.vars[0] in soln) {
                        var v = soln[r.vars[0]];
                        var s = v.toString();
                        if (!(s in m)) {
                            nodes.push(v);
                            m[s] = undefined;
                        }
                    }
                });

                if (r.solutions.length/nodes.length > 1.5)
                    iface.parseMessage("#data .log")
                    .append($('<div/>').html() + "<span class='info'>Found "+nodes.length+" unique nodes out of "+r.solutions.length+" solutions, you may want to SELECT DISTINCT or SELECT REDUCED for more efficiency.</span>" + "<br/>");
                iface.parseMessage("#data .now").addClass("progress")
                    .text("Building selection interface...");
                return idle(nodes);
            }

            function buildSelectList (nodes) {
                iface.graph = RDF.QueryDB(sparqlInterface, RDF.Dataset(), cacheSize);
                $("#starting-nodes option").remove();
                var newElts = nodes.map(function (node) {
                    var text = node.toString();
                    var amp = text.replace(/&/g, "&amp;");
                    return "<option value='"
                        +amp.replace(/'/g, "&quot;")
                        +"' selected='selected'>"
                        +amp.replace(/</g, "&lt;").replace(/>/g, "&gt;")
                        +"</option>";
                });
                var l = nodes.length
                var guess =  (30.25104 -.03174637*l + .00719544*l*l)/1000;
                iface.parseMessage("#data .now").addClass("progress")
                    .text("Updating browser list; this will take around "+guess+" seconds...");
                return idle(newElts);
            }

            function updateInterface (newElts) {
                var start = Date.now();
                $("#starting-nodes").append(newElts.join("")); // expensive opperation!
                var end = Date.now();
                $("#starting-nodes").multiselect("refresh");
                iface.dataSource = iface.dataSources.Query;
                iface.parseMessage("#data .now").removeClass("progress")
                    .text("Loaded " + newElts.length + " nodes from " + endpoint);
                $("#data-query-validate").removeAttr('disabled');
                iface.enableValidatorInput()
            }

            function handleError (e) {
                if (e instanceof Array) // [body, jqXHR, query, url]
                    return Promise.reject(RDF.StructuredError(
                        [["actionCategory", RDF.actionCategory.DATA],
                         ["text", e[1].statusText+" on "],
                         ['link', e[3],
                          [["text", "GET"]]],
                         ["code", e[1].status],
                         ["text", " from " + endpoint]
                        ]
                    ));
                else
                    return Promise.reject(RDF.StructuredError(
                        [["actionCategory", RDF.actionCategory.DATA],
                         ["text", e]
                        ]
                    ));
            }

            if ($("#opt-async").is(":checked"))
                return sparqlInterface.execute(query, {
                    async: true
                }).then(function (r) {
                    return idle(r);
                }).then(notifySearchingNodes).then(searchNodes).then(buildSelectList).then(updateInterface).catch(handleError);
            else
                try {
                    var r = null;
                    sparqlInterface.execute(query, {async: false, done: function (res) {
                        r = res;
                    }, fail: handleError});
                    notifySearchingNodes(r);
                    var nodes = searchNodes(r);
                    var newElts = buildSelectList(nodes);
                    updateInterface(newElts);
                    return null; // no promise means it's already done.
                } catch (e) {
                    handleError(e);
                }
        },

        loadData: function (url, id, done) {
            $.ajax({
                type: 'GET',
                dataType: "text",
                //contentType: 'text/plain',{turtle,shex}
                url: url,
                success: function(body, textStatus, jqXHR) {
                    // Loading non-endorsed links disables javascript extensions.
                    if (/^([a-z]+:)?\/\//g.test(url))
                        $('#opt-disable-js').attr('checked', true);
                    textValue(id, body);
                    done();
                    // looks like function() { iface.parseData() && iface.validator && iface.validate(); }
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    iface.parseMessage(id + " .now")
                        .removeClass("progress")
                        .addClass("error")
                        .empty()
                        .append("unable to load " + url + "\n" + textStatus + "\n" + errorThrown);
                }
            });
            iface.parseMessage(id + " .now").addClass("progress")
                .text("GETting " + url + "...");
            iface.disableValidatorOutput();
        },

        // redirectable alias for alert.
        lert: function() {
            alert($(this).html());
        },

        // uses graph.slice -- replace with uniqueNodes API call.
        selectNodesForValidation: function(nodes) {
            var triples = iface.graph.slice();
            var seen = {};
            var matched = 0;
            $("#starting-nodes option").remove();
            for (var i = 0; i < triples.length; ++i) {
                var s = triples[i].s;
                var str = s.toString();
                if (!(str in seen)) {
                    var text = s._ == 'BNode'
                        ? str // avoid "[]"s and "()"s
                        : textValue("#data").substr(s._pos.offset,s._pos.width);
                    seen[str] = text;
                    var selected = "";
                    if (nodes.indexOf(text) != -1) {
                        selected = " selected='selected'";
                        matched++;
                    }
                    $("#starting-nodes").append(
                        $("<option value='"
                          +(text.replace(/&/g, "&amp;").replace(/'/g, "&quot;"))
                          +"'"+selected+">"
                          +(text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
                          +"</option>"));
                }
            }

            if (matched == 0 && triples.length != 0) // fall back to the first node in the DB.
                $("#starting-nodes option:first-child").attr("selected", "selected");
            $("#starting-nodes").multiselect("refresh");
        },

        // Done filling the input fields; start the interface.
        allDataIsLoaded: function() {
            setHandler($("#schema .textInput"), iface.queueSchemaUpdate);
            setHandler($("#data .textInput"), iface.queueDataUpdate);
            setHandler($("#ctl-colorize, #starting-node, #opt-pre-typed, #opt-find-type, #opt-disable-js, #opt-closed-shapes"),
                       iface.handleParameterUpdate);
            setHandler($("#opt-async"), function () {
                if ("clearCache" in iface.graph)
                    iface.graph.clearCache();
                iface.handleParameterUpdate();
            });

            iface.layoutPanelHeights();
            $(window).resize(iface.handleResize);

            $("#apology").hide();
            $("#main").show();
            $("#schema .textInput, #data .textInput, #starting-node,"
              +"#opt-pre-typed, #opt-find-type, #opt-disable-js, #opt-closed-shapes, #opt-async").removeAttr("disabled");
            $("#schema .textInput").focus(); // set focus after removeAttr("disabled").
            if (iface.queryParms['find-types']) { // switch to pre after unhiding.
                $("#opt-pre-typed").prop( "checked", false );
                $("#opt-find-type").prop( "checked", true );
            } else {
                $("#opt-pre-typed").prop( "checked", true );
                $("#opt-find-type").prop( "checked", false );
            }

            if (iface.queryParms['starting-nodes']) { // switch to pre after unhiding.

                var startingNodes = []; // flatmap the n parms with space-separated entries.
                startingNodes = startingNodes.concat.apply(
                    startingNodes, iface.queryParms['starting-nodes'].map(function (s) {
                        return s.split(/ /);
                    })
                );
                if (startingNodes) {
                    // build a temporary selection list available at $("#starting-nodes").val()
                    $("#starting-nodes option").remove();
                    for (var i = 0; i < startingNodes.length; ++i) {
                        var text = startingNodes[i];
                        $("#starting-nodes")
                            .append("<option value='"
                                    +(text.replace(/&/g, "&amp;").replace(/'/g, "&quot;"))
                                    +"' selected='selected'>"
                                    +(text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
                                    +"</option>");
                    }
                }
            }

            if (iface.queryParms['closedShapes'] == "true")
                $("#opt-closed-shapes").prop( "checked", true );
            if (iface.queryParms['async'] == "true")
                $("#opt-async").prop( "checked", true );

            [["#data-get-url", "dataGetURL"],
             ["#data-query-endpoint", "dataQueryEndpoint"],
             ["#data-query-select", "dataQuerySelect"]].forEach(function (pair) {
                 var selector = pair[0], parm = pair[1];
                 var val = iface.queryParms[parm];
                 if (val)
                     $(selector).val(val);
             });

            // enablePre parses schema and data and validates if possible.
            if (iface.queryParms['colorize'] == "true") { // switch to pre after unhiding.
                $("#ctl-colorize").prop( "checked", true );
                iface.enablePre();
            } else {
                iface.parseSchema();
                iface.parseData();
                iface.validate();
            }
        },

        // Timer controls
        clearTimer: function(timer) {
            if (timers[timer] !== null) {
                clearTimeout(timers[timer]);
                timers[timer] = null;
            }
        },

        setTimer: function(timer, action) {
            timers[timer] = setTimeout(function() {
                action();
                timers[timer] = null;
            }, TIMEOUT);
        },

        clearStatus: function() {
            $("#valStatus").empty();
            $("#data .remainingData").removeClass("remainingData");
        },

        handleSchemaUpdate: function () {
            var now = textValue('#schema');
            // Early return if nothing's changed.
            if (last['#schema .textInput'] === now)
                return;
            last['#schema .textInput'] = now;

            // Reflect changed text in ['schema'] (not ['schemaURL']).
            delete iface.queryParms['schemaURL'];
            iface.queryParms['schema'] = [now];

            iface.parseSchema() && iface.graph && iface.validate();
        },
        queueSchemaUpdate: function (ev) {
            if (textValue("#schema") === last["#schema .textInput"])
                return;

            iface.clearStatus();
            iface.clearTimer(SCHEMA);
            iface.clearTimer(VALPARM);
            iface.setTimer(SCHEMA, iface.handleSchemaUpdate);
        },

        handleDataUpdate: function () {
            var now = textValue('#data');
            // Early return if nothing's changed.
            if (last['#data .textInput'] === now)
                return;
            last['#data .textInput'] = now;

            // Reflect changed text in ['data'] (not ['dataURL']).
            delete iface.queryParms['dataURL'];
            iface.queryParms['data'] = [now];

            iface.dataSource = iface.dataSources.Text;
            iface.parseData() && iface.validator && iface.validate();
        },
        queueDataUpdate: function() {
            if (textValue("#data") === last["#data .textInput"])
                return;

            iface.clearStatus();
            iface.clearTimer(DATA);
            iface.clearTimer(VALPARM);
            iface.setTimer(DATA, iface.handleDataUpdate);
        },

        updateURLParameters: function() {
            if ($("#opt-find-type").is(":checked")) { // vs. opt-pre-typed
                iface.queryParms['find-types'] = ["true"];
                var startingNodes = $("#starting-nodes").val();
                if (startingNodes)
                    iface.queryParms['starting-nodes'] = startingNodes;
                else
                    delete iface.queryParms['starting-nodes'];
            } else {
                delete iface.queryParms['find-types'];
                iface.queryParms['starting-nodes'] = [($("#starting-nodes").val() || []).join(' ')];
            }
            if ($("#ctl-colorize").is(":checked")) {
                iface.queryParms['colorize'] = ["true"];
            } else {
                delete iface.queryParms['colorize'];
            }
            if ($("#opt-closed-shapes").is(":checked")) {
                iface.queryParms['closedShapes'] = ["true"];
            } else {
                delete iface.queryParms['closedShapes'];
            }
            if ($("#opt-async").is(":checked")) {
                iface.queryParms['async'] = ["true"];
            } else {
                delete iface.queryParms['async'];
            }

            [["#data-get-url", "dataGetURL"],
             ["#data-query-endpoint", "dataQueryEndpoint"],
             ["#data-query-select", "dataQuerySelect"]].forEach(function (pair) {
                 var selector = pair[0], parm = pair[1];
                 var val = $(selector).val();
                 if (val) {
                     iface.queryParms[parm] = [val];
                     if (!$("#data-load").is(":visible")) {
                         $("a#data-load-tab.ui-tabs-anchor").click(); // switch to data-load tab.
                         iface.disableValidatorOutput();
                     }
                 } else {
                     delete iface.queryParms[parm];
                 }
            });
        },

        handleParameterUpdate: function() {
            if($("#starting-nodes").val() === last["#starting-nodes"]
               && $("#opt-pre-typed").is(":checked") === last["#opt-pre-typed"]
               && $("#opt-disable-js").is(":checked") === last["#opt-disable-js"]
               && $("#opt-closed-shapes").is(":checked") === last["#opt-closed-shapes"]
               && $("#opt-async").is(":checked") === last["#opt-async"]
               && $("#ctrl-colorize").is(":checked") === last["#ctrl-colorize"])
                return;

            if (timers[SCHEMA] !== null || timers[DATA] !== null)
                return;

            iface.clearStatus();
            iface.clearTimer(VALPARM);
            iface.setTimer(VALPARM, function() { iface.validate(); });
            iface.updateURLParameters();
        },

        enableValidatorInput: function() {
            $("#opt-pre-typed").removeAttr("disabled");
            $("#opt-find-type").removeAttr("disabled");
            $("#opt-disable-js").removeAttr("disabled");
            $("#opt-closed-shapes").removeAttr("disabled");
            $("#opt-async").removeAttr("disabled");

            // $("#settings input[name='mode']").change(); would trigger handleParameterUpdate() so:
            try{$("#starting-nodes").multiselect("enable");} catch (e) {} // may not yet be initialized
        },

        /* Turn bits of validator on or off depending on schema and data
         * availability */
        disableValidatorOutput: function() {
            $("#validation .log").empty();
            $("#validation .now").attr("class", "now message disabled").text("Validator not available.");
            try{$("#starting-nodes").multiselect("disable");} catch (e) {} // may not yet be initialized
            $("#opt-pre-typed").attr("disabled", "disabled");
            $("#opt-find-type").attr("disabled", "disabled");
            $("#opt-disable-js").attr("disabled", "disabled");
            $("#opt-closed-shapes").attr("disabled", "disabled");
            $("#opt-async").attr("disabled", "disabled");

            $("#valResults").addClass("disabled").text("Validation results not available.");
            $("#valResults-header").attr("class", "disabled");
        },

        enableValidatorOutput: function() {
            $("#valResults-header").attr("class", "validation-color");
            return $("#valResults").removeClass("disabled");
        },

        // Factors out code common to schema and data parsers. e.g.
        //   data = iface.runParser("#data", "Data", "data-color", function(text, iriResolver) {
        //     return TurtleParser.parse(text, {iriResolver: iriResolver});
        //   })
        runParser: function(id, label, colorClass, idPrefix, parse) {
            var now = textValue(id);

            var m = now.match(/^GET\s+(\S+)\s+$/);
            if (m) {
                iface.loadData(m[1], id, arguments.callee.caller.caller);
                throw {type: "pending", action: "GET", url: m[1]};
            }

            iface.parseMessage(id + " .now").removeClass("schema-color data-color").addClass("progress")
                .text("Parsing " + label + "...");
            iface.disableValidatorOutput();

            var iriResolver = RDF.createIRIResolver();
            var bnodeScope = RDF.createBNodeScope();
            var timeBefore = (new Date).getTime();
            var ret = {obj: parse(now, iriResolver, bnodeScope)};
            var timeAfter = (new Date).getTime();
            ret.iriResolver = iriResolver; // need it later
            ret.bnodeScope = bnodeScope;   // need it later

            iface.parseMessage(id + " .now")
                .removeClass("progress error")
                .addClass(colorClass)
                .text(label + " parsed.")
                .append(buildSizeAndTimeInfoHtml(
                    label + " parsing time and speed",
                    now.length / KB, "kB",
                    timeAfter - timeBefore
                ));
            if ($("#ctl-colorize").is(":checked")) {
                var element = $(id + " pre").get(0);
                var textMap = new CharMap(now);
                textMap.HTMLescape();
                var t = ret.obj.colorize(textMap, idPrefix);
                ret.idMap = t.idMap;
                ret.termStringToIds = t.termStringToIds;
                element.innerHTML = textMap.getText();
            }
            return ret;
        },

        parseSchema: function() {
            $("#view a").addClass("disabled");
            iface.validator = null;
            try {
                iface.schema = iface.runParser("#schema", "Schema", "schema-color", "r",
                                               function(text, iriResolver) {
                                                   return ShExParser.parse(text, {iriResolver: iriResolver});
                                               });
                iface.schema.obj.integrityCheck();
                iface.validator = iface.schema.obj; // intuitive alias
                enableValidatorLink();
                if (iface.graph)
                    iface.enableValidatorInput();
                var dtp = "data:text/plain;charset=utf-8;base64,";
                if (iface.validator.startRule) {
                    $("#opt-pre-typed").removeAttr("disabled");
                    $("#as-sparql-query"     ).attr("href", dtp + Base64.encode(iface.validator.SPARQLvalidation(iface.schema.iriResolver.Prefixes)));
                    $("#as-sparql-dump"      ).attr("href", dtp + Base64.encode(iface.validator.SPARQLdataDump(iface.schema.iriResolver.Prefixes)));
                    $("#as-remaining-triples").attr("href", dtp + Base64.encode(iface.validator.SPARQLremainingTriples(iface.schema.iriResolver.Prefixes)));
                    if (iface.validator.startRule._ == "BNode")
                        $("#start-rule").text("schema start rule");
                    else {
                        var startRuleText = iface.validator.startRule.toString(true);
                        $("#start-rule").text(startRuleText)
                            .mouseenter(function () {
                                $(this).addClass("ui-state-hover", 50);
                                if ($("#ctl-colorize").is(":checked"))
                                    iface.schema.termStringToIds.get(startRuleText).map(function (id) { $("#"+id).addClass("ui-state-hover", 50) })
                            })
                            .mouseleave(function () {
                                $(this).removeClass("ui-state-hover", 50);
                                if ($("#ctl-colorize").is(":checked"))
                                    iface.schema.termStringToIds.get(startRuleText).map(function (id) { $("#"+id).removeClass("ui-state-hover", 50) })
                            });
                    }
                } else {
                    $("#opt-pre-typed").attr("disabled", "disabled");
                    $("#opt-find-type").click();
                    $("#start-rule").empty()
                        .append('<a href="#" class="hasToolTip">schema start rule'
                                +'<span class="toolTip">'
                                +'A <strong>start rule</strong> provides a starting point for validation.<br/>'
                                +'This is specified in the form "<code>start=someShape</code>"'
                                +'where "<code>someShape</code>" is the name of a shape in the schema.</span></a>');
                }
                var prefixes = iface.schema.iriResolver.clone().Prefixes;
                prefixes['se'] = "http://www.w3.org/2013/ShEx/Definition#";
                prefixes['rs'] = "http://open-services.net/ns/core#";
                prefixes['shex'] = "http://www.w3.org/2013/ShEx/ns#";
                $("#as-resource-shape"   ).attr("href", dtp + Base64.encode(iface.validator.toResourceShapes(prefixes, 'se', 'rs')));
                $("#as-resource-sexpr"   ).attr("href", dtp + Base64.encode(iface.validator.toSExpression(0)));
                $("#as-resource-haskell" ).attr("href", dtp + Base64.encode(iface.validator.toHaskell(0)));
                if (textValue("#schema") === '') {
                    iface.parseMessage("#schema .now").append("<div id=\"emptySchema\"><h3>Empty Schema</h3>An empty schema is valid, but you might want to see <a href=\"Examples\" style='background-color: yellow;'>some examples</a>.</div>");
                    $("#emptySchema").css("position","absolute").css("top",($("#schema .textInput").height()/3)+"px").css("left","3em");
                } else
                    $("#view a").removeClass("disabled");
            } catch (e) {
                if (typeof(e) !== 'object' || e.type !== "pending")
                    iface.parseMessage("#schema .now")
                    .removeClass("progress")
                    .addClass("error")
                    .append(buildErrorMessage(e, "#schema", "Schema"));
                var unavailable = "data:text/plain;charset=utf-8;base64,"
                    + Base64.encode("Alternate representations unavailable when ShEx fails to parse.");
                $("#as-sparql-query"     ).attr("href", unavailable);
                $("#as-sparql-dump"      ).attr("href", unavailable);
                $("#as-remaining-triples").attr("href", unavailable);
                $("#as-resource-shape"   ).attr("href", unavailable);
                $("#as-resource-sexpr"   ).attr("href", unavailable);
                $("#as-resource-haskell" ).attr("href", unavailable);
            }

            iface.updateURL();
            return iface.validator !== null;
        },

        parseData: function() {
            if (iface.dataSource == iface.dataSources.Query)
                return true;
            iface.graph = null;
            try {
                iface.data = iface.runParser("#data", "Data", "data-color", "t",
                                             function(text, iriResolver) {
                                                 return TurtleParser.parse(text, {iriResolver: iriResolver});
                                             });
                iface.graph = iface.data.obj; // intuitive alias
                if (iface.validator) {
                    enableValidatorLink();
                    iface.enableValidatorInput();
                }
                var was = $("#starting-nodes").val() || [];
                iface.selectNodesForValidation(was);
                iface.updateURLParameters();
                // if (iface.graph.length() &&
                //     iface.graph.triplesMatching_str($("#starting-nodes").val(), undefined, undefined).length === 0) {
                //     $("#starting-nodes").val(iface.graph.slice(0,1)[0].s);
                //     iface.updateURLParameters();
                // }
            } catch (e) {
                if (typeof(e) !== 'object' || e.type !== "pending") {
                    iface.parseMessage("#data .now").
                        removeClass("progress").
                        addClass("error").
                        append(buildErrorMessage(e, "#data", "Data"));
                }
            }

            iface.updateURL();
            return iface.graph !== null;
        },

        validateCore: function() {
            if (!iface.validator || !iface.graph || iface.graph.length() == 0)
                return;

            last["#starting-nodes"]  = $("#starting-nodes").val();
            last["#opt-pre-typed"]  = $("#opt-pre-typed").is(":checked");
            last["#opt-disable-js"] = $("#opt-disable-js").is(":checked");
            last["#opt-closed-shapes"] = $("#opt-closed-shapes").is(":checked");
            last["#opt-async"] = $("#opt-async").is(":checked");
            last["#ctrl-colorize"] = $("#ctrl-colorize").is(":checked");

            $("#validation .log").text("");
            $("#validation .now").addClass("progress").text("validating...");
            //$("#schema .textInput .error").removeClass("error");
            //$("#data .textInput .error").removeClass("error");

            var timeBefore = (new Date).getTime();
            iface.validator.termResults = {}; // clear out yester-cache

            iface.validator.handlers = {
                GenX: RDF.GenXHandler(document.implementation, new XMLSerializer()),
                GenJ: RDF.GenJHandler({}),
                GenN: RDF.GenNHandler({}),
                GenR: RDF.GenRHandler({})
            };
            iface.validator.alwaysInvoke = {};
            if (!$("#opt-disable-js").is(":checked")) {
                iface.validator.handlers['js'] = RDF.jsHandler();
                iface.validator.handlers['ps'] = RDF.psHandler();
            }
            if (iface.validator.disableJavascript)
                iface.message("javascript disabled");

            var preTyped = $("#opt-pre-typed").is(":checked");
            if (preTyped && !iface.validator.startRule) {
                $("#validation .now").removeClass("progress").empty().append($('<div/>').html() + "<span class='error'>No schema start rule against which to validate.</span>" + "<br/>");
            } else {
                var schema = iface.validator; // shortcut.
                if (!preTyped)
                    for (var handler in schema.handlers)
                        if ('beginFindTypes' in schema.handlers[handler])
                            schema.handlers[handler]['beginFindTypes']();
                var startingNodes = $("#starting-nodes").val() || [];
                var testAgainst =
                    preTyped ?
                    [iface.validator.startRule] :
                    schema.ruleLabels.map(function (ruleLabel) {
                        return schema.isVirtualShape[ruleLabel.toString()] ?
                            null :
                            ruleLabel;
                    }).filter(function (ruleLabel) { return !!ruleLabel; });
                try {
                    var pair = iface.iterateNodesAndLabels(startingNodes, testAgainst, schema, preTyped, timeBefore);
                    var resOrPromises = pair[0], modelIntersection = pair[1];
                    if ($("#opt-async").is(":checked"))
                        Promise.all(resOrPromises).
                        then(function (results) {
                            renderAllResults(results, preTyped, modelIntersection, timeBefore);
                        }).catch(function (e) {
                            iface.renderError(e, "#validation .now");
                        }).catch(function (e) {
                            alert("uncaught error in error handler: " + e);
                            return e;
                        });
                    else
                        renderAllResults(resOrPromises, preTyped, modelIntersection, timeBefore);
                } catch (e) {
                    try {
                        iface.renderError(e, "#validation .now");
                    } catch (e) {
                        alert("uncaught error in error handler: " + e);
                        return e;
                    }
                }
            }
            iface.updateURL();
        },

        iterateNodesAndLabels: function (startingNodes, testAgainst, schema, preTyped, timeBefore) {
            var resOrPromises = [];
            var termResults = RDF.TermResults();
            var modelIntersection = null;
                startingNodes.forEach(function (startingNode) {
                    if (startingNode.charAt(0) == '_' && startingNode.charAt(1) == ':') {
                        startingNode = RDF.BNode(startingNode.substr(2), RDF.Position0())
                    } else {
                        if (startingNode.charAt(0) != '<') {
                            var colon = startingNode.indexOf(":");
                            if (colon === -1)
                                throw "pre-typed graph node must be a _:bnode, <iri>, or q:name";
                            startingNode
                                = '<'
                                + iface.data.iriResolver.getPrefix(startingNode.substring(0,colon))
                                + startingNode.substring(colon+1)
                                + '>';
                        }
                        startingNode =
                            RDF.IRI(iface.data.iriResolver.getAbsoluteIRI
                                    (startingNode.substr(1,startingNode.length-2))
                                    , RDF.Position0());
                    }
                    testAgainst.forEach(function (ruleLabel) {
                        var pos0 = RDF.Position0();
                        var niceRuleLabel = ruleLabel._ == "BNode" && ruleLabel == iface.validator.startRule ?
                            "schema start rule" :
                            ruleLabel.toString();
                        var elt =
                            iface.message("Validating " + startingNode + " as " + niceRuleLabel + ".");
                        var instSh = RDF.IRI("http://open-services.net/ns/core#instanceShape", pos0);
                        var vs = RDF.ValidatorStuff(iface.schema.iriResolver,
                                                    $("#opt-closed-shapes").is(":checked"),
                                                    $("#opt-async").is(":checked"),
                                                    termResults).
                            push(startingNode, ruleLabel, instSh);
                        var resOrPromise = iface.validator.validate(startingNode, ruleLabel, iface.graph, vs, true);
                        // termResults = {}; // clear out yester-cache

                        if ($("#opt-async").is(":checked"))
                            resOrPromises.push(resOrPromise.then(post, startingNode, ruleLabel));
                        else
                            resOrPromises.push(post(resOrPromise, startingNode, ruleLabel));
                        function post (r) {
                            r.elt = elt; // write it into the r for later manipulation
                            if (preTyped) {
                                if (r.passed())
                                    elt.addClass("success").empty().
                                    append(HEsc(startingNode + " matches " + niceRuleLabel));
                                else
                                    elt.addClass("error").empty().
                                    append(HEsc(startingNode + " fails " + niceRuleLabel));
                            } else {
                                if (r.passed()) {
                                    // add a fake rule with a value reference for oslc:instanceShape
                                    elt.empty().
                                        append(HEsc(startingNode + " is a " + niceRuleLabel + "."));
                                } else {
                                    // Get rid of the message saying were checking this node.
                                    var br = elt.next();
                                    elt.remove();
                                    br.remove();
                                }
                            }

                            r.model = vs.termResults.getModel().filter(function (tr) {
                                return !(tr.node === startingNode && tr.shape === ruleLabel);
                            });
                            // console.log(r.model.map(function (tr) { return tr.key+"->"+tr.res; }).join("\n"));
                            if (modelIntersection === null)
                                modelIntersection = r.model.filter(function (tr) {
                                    return tr.res === false;
                                });
                            else {
                                var seen = r.model.filter(function (tr) {
                                    return tr.res === false;
                                }).map(function (tr) {
                                    return tr.key;
                                });
                                modelIntersection = modelIntersection.filter(function (tr) {
                                    return seen.indexOf(tr.key) !== -1;
                                });
                            }
                            return r;
                        }
                    });
                });
            return [resOrPromises, modelIntersection || []];
        },


        // nodes: array of RDF nodes
        // sparqlInterface: URL of query engine
        validateOverSPARQL: function () {
            var nodes = $("#starting-nodes").val();
            iface.parseMessage("#data .now").addClass("progress")
                .text("Validating " + nodes.length + " node" + (nodes.length === 1 ? "" : "s") +
                      " at " + iface.graph.sparqlInterface.getURL() + "...");
            textValue("#data", "");
            iface.validator.termResults = {}; // clear out yester-cache
            var timeBefore = (new Date).getTime();
            iface.validateCore()
            var timeAfter = (new Date).getTime();
            iface.parseMessage("#data" + " .now")
                .removeClass("progress")
                .addClass("data-color")
                .text("Data" + " crawled.")
                .append(buildSizeAndTimeInfoHtml(
                    "Data" + " crawling time and speed",
                    iface.graph.seen(), "queries",
                    timeAfter - timeBefore
                ));
        },

        validate: function () {
            if (iface.dataSource == iface.dataSources.Query)
                iface.validateOverSPARQL();
            else
                iface.validateCore();
        },

        mapResultsToInput: function(r, valResultsElement, solnSetID, solutionsToRuleAndTriple, title, inAllModels) {
            // non-jquery functions from SimpleShExDemo
            function removeClass (type, list, className) {
                if (list === undefined) return;
                for (var i = 0; i < list.length; ++i)
                    document.getElementById(type + list[i]).classList.remove(className);
            }
            function addClass (type, list, className, container) {
                if (list === undefined) return;
                for (var i = 0; i < list.length; ++i) {
                    var elt = $("#"+type+list[i]);
                    elt.addClass(className);
                    if (container) {
                        // smooth out .scrollIntoView with:
                        // http://stackoverflow.com/questions/1805808/how-do-i-scroll-a-row-of-a-table-into-view-element-scrollintoview-using-jquery#answer-3782959
                        var containerTop = container.scrollTop();
                        var containerBottom = containerTop + container.height();
                        var elemTop = elt.get(0).offsetTop;
                        var elemBottom = elemTop + elt.height();
                        if (elemTop < containerTop) {
                            container.scrollTop(elemTop);
                        } else if (elemBottom > containerBottom) {
                            container.scrollTop(elemBottom - container.height());
                        }
                    }
                }
            }

            var solnSetIDPrefix = solnSetID+"-";
            var solutions = solutionsToRuleAndTriple[solnSetIDPrefix] = [];
            var markup = r.toHTML(0, solnSetIDPrefix, iface.schema.idMap, iface.data.idMap, solutions,
                                  { schema: 'schemaflow', data: 'dataflow',
                                    addErrorClass: function(type, list) {
                                        addClass(type, list, "error", null);
                                    }});
            var clss = r.passed() ? "success" : "error";
            modelStr = iface.makeModelStr(r.model, inAllModels);
            var elt = $("<div id='"+solnSetID+"' class='resultsDiv' style='border-left: solid 1em #ddf; margin-bottom: 2ex;'><span class='"+clss+"'>"+title+":</span>"+modelStr+"<br/>"+markup+"</div>")
            valResultsElement.append(elt);

            var remainingTripleIDs = null;
            if (r.passed() && iface.graph.length() != -1) { // -1 signals unknown length db @@ needs UI switch
                // Make a container for remaining triples.
                var pre = $("<pre class='remainingDataContainer'>");
                // remainingTripleIDs will return a list of ordinals for the remaining triples.
                remainingTripleIDs = markupMissedTriples(pre, r, solnSetID)
                if (remainingTripleIDs.length) {
                    elt.append($("<br/><strong>Remaining triples:</strong>\n\n"));
                    // Render remaining triples in results.
                    elt.append(pre);

                    // Hovering over the remaining triples block highlights those triples in the data.
                    function eachRemaining (add) {
                        remainingTripleIDs.forEach(function (tripleID) {
                            iface.data.idMap.getMembers(tripleID).forEach(function (solnSetID) {
                                if (add)
                                    $("#"+solnSetID).addClass("remainingData");
                                else
                                    $("#"+solnSetID).removeClass("remainingData");
                            });
                        });
                    }
                    pre.hover(function () { eachRemaining(1); },
                              function () { eachRemaining(0); });
                } else {
                    elt.append("No remaining triples.");
                }
            }
            var lastRule = [], lastTriple = [], lastSolution = [], rules = [], triples = [];

            // Populate rules and triples vectors from the solutions.
            for (var s = 0; s < solutions.length; ++s) {
                // t or r may be undefined as some solutions don't include them.
                var t = solutions[s].triple;
                var r = solutions[s].rule;
                if (t !== undefined) {
                    if (!triples[t]) triples[t] = {rules:[], solutions:[]};
                    if (r !== undefined) triples[t].rules.push(r);
                    triples[t].solutions.push(s);
                }
                if (r !== undefined) {
                    if (!rules[r]) rules[r] = {triples:[], solutions:[]};
                    if (t !== undefined) rules[r].triples.push(t);
                    rules[r].solutions.push(s);
                }
            }
            // Populate rules and triples vectors from the solutions.
            for (var t = 0; t < triples.length; ++t)
                if (!triples[t]) triples[t] = {rules:[], solutions:[]};
            for (var r = 0; r < rules.length; ++r)
                if (!rules[r]) rules[r] = {triples:[], solutions:[]};

            // ugly window.hilight while i search for workaround.
            hilight = function (solnSetIDPrefix, solutionList, schemaList, dataList) {

                // See if two lits have the same elements.
                function sameElements (left, right) {
                    if (left === undefined) return right === undefined ? true : false;
                    if (right === undefined) return false;
                    if (left.length != right.length) return false;
                    for (var i = 0; i < left.length; ++i)
                        if (left[i] !== right[i])
                            return false;
                    return true;
                }

                // Turn off current highlighting.
                removeClass(iface.curSolnSetIDPrefix, lastSolution, "hilightSolution");
                removeClass("r", lastRule, "hilightRule");
                if (iface.data.idMap)
                    for (var i = 0; i < lastTriple.length; ++i)
                        removeClass("", iface.data.idMap.getMembers(lastTriple[i]), "hilightData");

                if (iface.curSolnSetIDPrefix === solnSetIDPrefix &&
                    sameElements(lastRule, schemaList) &&
                    sameElements(lastTriple, dataList) &&
                    sameElements(lastSolution, solutionList)) {

                    // User has disabled highlighting.
                    lastRule = [];
                    lastTriple = [];
                    lastSolution = [];
                } else {

                    // Update registers with current highlights.
                    if (solutionList.length)
                        document.getElementById("curSolution").value = solutionList[solutionList.length-1];
                    if (schemaList.length)
                        document.getElementById("curRule").value = schemaList[schemaList.length-1];
                    if (dataList.length)
                        document.getElementById("curData").value = dataList[dataList.length-1];

                    // Highlight the indicated solution, rule and data elements.
                    addClass(solnSetIDPrefix, solutionList, "hilightSolution", $("#results"));
                    addClass("r", schemaList, "hilightRule", $("#schema .textInput"));
                    for (var i = 0; i < dataList.length; ++i)
                        if (dataList[i] != null)
                            addClass("", iface.data.idMap.getMembers(dataList[i]), "hilightData", $("#data .textInput"));

                    // Write down current state.
                    lastRule = schemaList;
                    lastTriple = dataList;
                    lastSolution = solutionList;
                }

                // Set solution no for up and down keys
                iface.curSolnSetIDPrefix = solnSetIDPrefix;
            };

            function down (solnSetIDPrefix) {
                var f = $(document.activeElement)[0];
                if (f === $("#schema .textInput")[0]) {
                    var i = document.getElementById("curRule").value;
                    if (++i < rules.length)
                        hilight(solnSetIDPrefix, rules[i].solutions, [i], rules[i].triples);
                } else if (f === $("#data .textInput")[0]) {
                    var i = document.getElementById("curData").value;
                    if (++i < triples.length)
                        hilight(solnSetIDPrefix, triples[i].solutions, triples[i].rules, [i]);
                } else {
                    var i = document.getElementById("curSolution").value;
                    var slns = solutionsToRuleAndTriple[solnSetIDPrefix];
                    if (++i < slns.length)
                        hilight(solnSetIDPrefix, [i], slns[i].rule === undefined ? [] : [slns[i].rule], slns[i].triple === undefined ? [] : [slns[i].triple]);
                }
            }
            // function goTo () {
            //     var s = document.getElementById("curSolution").value;
            //     if (s < 0 || s > slns.length-1)
            //         s = 0;
            //     document.getElementById("curSolution").value = s;
            //     hilight(solnSetIDPrefix, [s], [slns[s].rule], [slns[s].triple]);
            // }
            function up (solnSetIDPrefix) {
                var f = $(document.activeElement)[0];
                if (f === $("#schema .textInput")[0]) {
                    var i = document.getElementById("curRule").value;
                    if (--i >= 0)
                        hilight(solnSetIDPrefix, rules[i].solutions, [i], rules[i].triples);
                } else if (f === $("#data .textInput")[0]) {
                    var i = document.getElementById("curData").value;
                    if (--i >= 0)
                        hilight(solnSetIDPrefix, triples[i].solutions, triples[i].rules, [i]);
                } else {
                    var i = document.getElementById("curSolution").value;
                    var slns = solutionsToRuleAndTriple[solnSetIDPrefix];
                    if (--i >= 0)
                        hilight(solnSetIDPrefix, [i], slns[i].rule === undefined ? [] : [slns[i].rule], slns[i].triple === undefined ? [] : [slns[i].triple]);
                }
            }
            // document.getElementById("keysSolution").onkeydown = function () {
            //     if (event.keyCode == 38) up()
            //     else if (event.keyCode == 40) down();
            // };
            // document.getElementById("up").onclick = function () { up(); }
            // document.getElementById("curSolution").onchange = function () { goTo(); }
            // document.getElementById("down").onclick = function () { down(); }

            function keydown(e, solnSetIDPrefix) {
                function buttonKeys (e) {
                    e = e || window.event;
                    var keyCode = e.keyCode || e.which;
                    var f = $(document.activeElement)[0];
                    if (!e.ctrlKey && f !== $("#schema .textInput")[0] && f !== $("#data .textInput")[0]) {
                        if (e.shiftKey) {
                            // Moved output.clear down into simple validate. Keeping
                            // old code and inputs around for later reversion.
                            // if (keyCode == 86) {
                            //     document.getElementById("output").textContent = "";
                            //     validate();
                            //     return false;
                            // }
                        } else {
                            switch (keyCode) {
                            case 86:
                                document.getElementById("output").textContent = "";
                                validate();
                                return false;
                                // case 82: // 'R'
                                //     if (e.ctrlKey)
                                //         return true;
                                //     document.getElementById("output").textContent = "";
                                //     return false;
                            case 83: // 'S'
                                if (e.ctrlKey)
                                    return true;
                                document.getElementById("schemaText").textContent = "";
                                return false;
                            case 68: // 'D'
                                if (e.ctrlKey)
                                    return true;
                                document.getElementById("turtleText").textContent = "";
                                return false;
                            }
                        }
                    }
                    return true;
                }
                e = e || window.event;
                var keyCode = e.keyCode || e.which,
                arrow = {left: 37, up: 38, right: 39, down: 40 };

                if (e.ctrlKey && !e.shiftKey)
                    switch (keyCode) {
                    case arrow.up:
                        up(solnSetIDPrefix);
                        return false;
                    case arrow.down:
                        down(solnSetIDPrefix);
                        return false;
                    }
                return buttonKeys(e);
            };
            $("body").keydown(function (ev) {
                if (ev.timeStamp != iface.lastKeyDownTime) {
                    iface.lastKeyDownTime = ev.timeStamp;
                    return keydown(ev, iface.curSolnSetIDPrefix); // set by last hilight() call
                }
            });
            $("#valStatus").empty().append($("<p><strong>result navigation enabled</strong> — use ctrl-↑ and ctrl-↓ to browse results.</p>"));
            return remainingTripleIDs;
        },

        enablePre: function() {
            $("#schema, #data").each(function(el) {
                //$(this).find("pre").get(0).innerText = $(this).find("textarea.textInput").val();
                $(this).find("pre").text($(this).find("textarea.textInput").val());
                var width = $(this).width();
                $(this).find("textarea.textInput").css("display", "none").removeClass("textInput");
                $(this).find("pre").addClass("textInput").css("display", "block");
                $(this).width(width);
                $(this).find(".editparent").contentEditable().change(iface.queueSchemaUpdate);
            });
            iface.parseSchema();
            iface.parseData();
            if (iface.validator && iface.graph)
                iface.validate();
        },

        enableTextarea: function() {
            $("#schema, #data-input").each(function(el) {
                //$(this).find("textarea.textInput").val($(this).find("pre").get(0).innerText);
                var from = $(this).find("pre");
                var to = $(this).find("textarea");
                to.val(from.text());
                from.css("display", "none").removeClass("textInput");
                to.addClass("textInput").css("display", "block");
            });
        },

        handleResize: function(ev) {
            if ($("#ctl-colorize").is(":checked")) // brutal hack
                iface.enableTextarea();
            iface.layoutPanelHeights();
            if ($("#ctl-colorize").is(":checked"))
                iface.enablePre();
        },

        getPanelHeight: function () {
            return $(window).height()/2 + "px";
        },

        layoutPanelHeights: function(ev) {
            var panelHeightPx = iface.getPanelHeight();
            $("#schema .textInput").outerHeight(panelHeightPx);
            $("#data .textInput").outerHeight(panelHeightPx);
        },

        renderError: function (e, target) {
                        var html = null;
                        if (typeof e == "object" && e._ == "StructuredError") {
                            if (e.actionCategory === RDF.actionCategory.DATA)
                                target = "#data .now";
                            else if (e.actionCategory === RDF.actionCategory.SCHEMA)
                                target = "#schema .now";
                            html = e.toHTML();
                        } else {
                            html = $('<div/>').text(e).html();
                        }

                        // if (target) {
                        //     iface.parseMessage(target).addClass("error").
                        //     append("<p>error "+e.actionCategory+"</p>");
                        // }
                        $(target).removeClass("progress").empty().addClass("error").
                            append($("<span class='error'>error: "+
                                     html+
                                     "</span><br/>"));
                        $('.popup').click(function(event) {
                            event.preventDefault();
                            window.open($(this).attr("href"), "popupWindow", "width=600,height=600,scrollbars=yes");
                        });
                        //$("#validation .now").attr("class", "message error").append("error:"+e).append($("<br/>"));
                    },

        makeModelStr: function (model, inAllModels) {
            // We only care about solutions that were negative in this
            // model but not all models.
            var thisModelDelta = model.filter(function (tr) {
                return tr.res === false && inAllModels.indexOf(tr.key) === -1;
            });
            return thisModelDelta.length ?
                (" assuming " + thisModelDelta.map(function (tr) {
                    return HEsc(tr.node.toString())+(tr.res ? " matches " :  " fails ")+HEsc(tr.shape.toString());
                }).join(", ")) :
            "";
        }

    };

    // Inject a jquery-dependent toHTML into every RDF.StructuredError.
    RDF.StructuredError_proto.toHTML = function () {
        var ob = this;
        function nest (a) {
            var target =
                a[0][0] == "NestedError" && a[0][1] === RDF.actionCateogyr.SCHEMA ?
                "#schema .now" :
                a[0][0] == "NestedError" && a[0][1] === RDF.actionCateogyr.DATA ?
                "#data .now" :
                "#validation .now";
            return a.map(function (p) {
                if (p[0] == "code")
                    return "<pre style='margin: 0;'>"+$('<div/>').text(p[1]).html()+"</pre>";
                if (p[0] == "link")
                    return "<a href='"+p[1]+"' class='popup'>"+nest(p[2])+"</a>";
                if (p[0] == "SyntaxError") {
                    debugger;
                    textValue("#data", p[2]);
                    return buildErrorMessage(p[1], "#data", "Data");
                }
                if (p[0] == "NestedError") {
                    debugger;
                    try {
                        return "<br/>"+p[1].toHTML();
                    } catch (e) {
                        try {
                            return p[1].toString();
                        } catch (e) {
                            return JSON.stringify(p[1]);
                        }
                    }
                }
                return ""+p[1];
            }).join("");
        };
        return nest(this.data);
    };

    $.fn.slideFadeToggle = function(easing, callback) {
        return this.animate({ opacity: 'toggle', height: 'toggle' }, 'fast', easing, callback);
    };

    $("pre.textInput").click(function () {
        if ($("#ctl-colorize").is(":checked")) {
            $("#ctl-colorize").attr('checked', false);
            iface.enableTextarea();
        }
    });

    return iface;

    function markupMissedTriples (targetElement, r, solutionSetID) {
        // replace with an encapsulating object with remaining triples.
        var triplesEncountered = r.triples();

        var remaining = iface.graph.triples.filter(function (t) {
            return triplesEncountered.indexOf(t) == -1;
        });
        var remainingTripleIDs = remaining.map(function (t) {
            var ts = t.toString();
            var to = t.s.toString(true) + " " + t.p.toString(true) + " " + t.o.toString(true) + " .";
            var tripleID = iface.data.idMap.getInt(ts);

            targetElement.append("  ");
            targetElement.append(
                $("<span  class='remainingData data'"
                  + ">"+to.replace(/</gm, '&lt;').replace(/>/gm, '&gt;')
                  + "</span>\n")
                    .mouseenter(function() {
                        $(this).addClass("highlightTerms");
                        iface.data.idMap.getMembers(tripleID).forEach(function (tid) {
                            $("#"+tid).addClass("highlightTerms");
                        });
                    })
                    .mouseleave(function() {
                        $(this).removeClass("highlightTerms");
                        iface.data.idMap.getMembers(tripleID).forEach(function (tid) {
                            $("#"+tid).removeClass("highlightTerms");
                        });
                    })
            );
            targetElement.append("\n");
            return tripleID;
        });
        return remainingTripleIDs;
    }

                function renderAllResults (results, preTyped, modelIntersection, timeBefore) {
                        if (!preTyped)
                            for (var handler in schema.handlers)
                                if ('endFindTypes' in schema.handlers[handler])
                                    schema.handlers[handler]['endFindTypes']();

                        var timeAfter = (new Date).getTime();

                        iface.status("Validation complete.");
                        $("#validation .now")
                            .attr("class", "now message validation-color")
                            .append(buildSizeAndTimeInfoHtml(
                                "Validation time and speed",
                                iface.graph.length(), "triples",
                                timeAfter - timeBefore
                            ));

                        var valResultsElement = iface.enableValidatorOutput();

                        // inAllModels is a list of the nodes that
                        // were presumed to PASS for a recursive
                        // validation but turned out to FAIL.
                        var inAllModels = modelIntersection.filter(function (tr) {
                            return tr.res === false;
                        }).map(function (tr) {
                            // Just keep the key, e.g. "<http://ex.example/#c> @<T>".
                            return tr.key;
                        });

                        if (results.length === 0) {
                            iface.message("(There were no nodes to validate.)");
                            valResultsElement.text("No nodes to validate.");
                        } else if ($("#ctl-colorize").is(":checked")) {
                            var resNo = 0;
                            valResultsElement.empty();
                            var allRemainingTripleIDs = null; // null or intersection of missed triples.
                            var solutionsToRuleAndTriple = {};
                            results.forEach(function (r) {
                                var solnSetID = "resNo"+(resNo++);
                                var title = r.elt.html();
                                r.elt.html("<a href='#"+solnSetID+"'>"+title+"</a>");

                                // Render result in the results pane.
                                solutionsToRuleAndTriple[solnSetID] = [];
                                var remainingTripleIDs = iface.mapResultsToInput(r, valResultsElement, solnSetID, solutionsToRuleAndTriple, title, inAllModels);
                                if (remainingTripleIDs) {
                                if (allRemainingTripleIDs === null)
                                    allRemainingTripleIDs = remainingTripleIDs;
                                else
                                    allRemainingTripleIDs = allRemainingTripleIDs.filter(function (tid) {
                                        return remainingTripleIDs.indexOf(tid) !== -1;
                                    });
                                }
                            });
                            // Highlight triples not touched in any result.
                            if (allRemainingTripleIDs)
                                allRemainingTripleIDs.forEach(function (tripleID) {
                                    iface.data.idMap.getMembers(tripleID).forEach(
                                        function (tid) { $("#"+tid).addClass("allRemainingData"); }
                                    );
                                });
                        } else {
                            var resNo = 0;
                            valResultsElement.html(results.map(function (r) {
                                var solnSetID = "resNo"+(resNo++);
                                var title = r.elt.html();
                                r.elt.html("<a href='#"+solnSetID+"'>"+title+"</a>");
                                var clss = r.passed() ? "success" : "error";
                                var modelStr = iface.makeModelStr(r.model, inAllModels);
                                return "<span id='"+solnSetID+"' class='"+clss+"'>"+title+":</span>"+modelStr+"\n"+HEsc(r.toString(0));
                                // return HEsc(r.toString(0));
                            }).join("\n<hr>\n"));
                        }

                        function generatorInterface (gen, mediaType) {
                            if (iface.validator.handlers[gen].text) {
                                var win = gen+'window';
                                var divId = gen+'Div';
                                var useId = 'Use'+gen+'Button';
                                var stopId = 'Stop'+gen+'Button';

                                var link = "data:"+mediaType+";charset=utf-8;base64,"
                                    + Base64.encode(iface.validator.handlers[gen].text);
                                //$("#validation .log").append($('<div><a href="' + link +'">'+gen+' output</a></div>')
                                var options = 'width='+(window.innerWidth/3)
                                    +' , height='+(window.innerHeight/3);
                                var openFunc = function () {
                                    return iface[win] = window.open(link , gen, options);
                                }
                                $("#validation .log").append("<div id=\""+divId+"\"/>")
                                var addUseButton = function (next, self) {
                                    $("#"+divId+"").empty().append($('<div>View '+gen+' output as <button id="'+useId+'" href="#" >popup</button> or <a style="background-color: buttonface;" href="'
                                                                     + link
                                                                     +'">link</a>.</div>'));
                                    $('#'+useId+'').click(function () {
                                        openFunc();
                                        next(self, next);
                                    });
                                };
                                var delStopButton = function (next, self) {
                                    $("#"+divId+"").empty().append($('<div><button id="'+stopId+'" href="#" >Stop updating '+gen+' popup</button>.</div>'));
                                    $('#'+stopId+'').click(function () {
                                        // iface[win].document.close();
                                        iface[win] = undefined;
                                        next(self, next);
                                    });
                                };
                                if (!iface[win] || !openFunc()) {
                                    addUseButton(delStopButton, addUseButton);
                                } else {
                                    delStopButton(addUseButton, delStopButton);
                                }
                                iface.validator.handlers[gen].text = null;
                            }
                        };
                        generatorInterface('GenX', 'application/xml');
                        generatorInterface('GenJ', 'application/json');
                        generatorInterface('GenN', 'text/plain');
                        generatorInterface('GenR', 'text/plain');
                        if (!$("#opt-disable-js").is(":checked"))
                            generatorInterface('ps',   'text/plain');
                    }

};
