/*

Open-source, copyright free, non-commercial.  
Make it better!  One Github:
https://github.com/jmattthew/Twitch-Tags

TO DO:  hook into twitch login system to allow users to transport their tags between browsers/devices 

*/ 







//                    ==========================
//
//
//                    ON STARTUP ACTION
//
//
//                    ==========================

// Set Global Variables
var communityTags = [];
var userTags = [];
var searchTags = [];
var availableTags = [];
var searchResults = [];
var serverQ = [];
var streamName = ''; 
var userIDHash = '';
var suggestTimeout; // used with setTimeout 
var flagTolerance = 10; // number of users who need to flag before we hide
var tkServerHREF = 'http://mattthew.t15.org/'
// var tkServerHREF = 'http://localhost/'; // get data from local test server
var suppressLog = true; // used to suppress debugging sent with console.assert 

// colors added by JS
var tagInputColor = '#000';
var tagInputColorBG = 'rgb(255, 255, 255)';
var tagInputErrorColorBG = 'rgb(252, 238, 218)';
var tagSearchColor = '#FFF';
var userTagColorBG = 'rgba(100, 65, 165, 0.2)';
var tagHolderSmallHeight = 100; 
var tagSuggestionHeight = 25;

// Twitch.tv element IDs
var twitchActions = $('.channel-actions');
var twitchSearch = $('#sidebar_search'); 
var twitchSearchHolder = $('#large_nav #nav');
var twitchResultsHolder = $('#nav_personal');
var twitchPlayer = $('#player');

var tagTemplate = '';
tagTemplate = '<div id="tk_tag_$TN$" class="tk_tag">';
tagTemplate += '<div class="tk_tagName">$TN$</div>';
tagTemplate += '<div class="tk_tagTotal">$VT$</div>';
tagTemplate += '<a href="#" class="tk_tagButtonUp">';
tagTemplate += '<i class="fa fa-thumbs-o-up fa-lg"></i></a>';
tagTemplate += '<a href="#" class="tk_tagButtonDown fa fa-flip-horizontal">';
tagTemplate += '<i class="fa fa-thumbs-o-down fa-lg"></i></a>';
tagTemplate += '<a href="#" class="tk_tagButtonFlag"><i class="fa fa-bolt fa-lg"></i></a>'
tagTemplate += '</div>';








// starts everything off

beforeData();
getData();









// MISC FUNCTIONS
// ==========================
function beforeData() {
	insertStyles();
	insertHolders();
}

// Retreive Data from server 
// and fill local arrays
// ajax calls nested so they're syncronous
// after getting data, call afterData

function getData() {

	streamName = getSteamName(); 
	userIDHash = getuserIDHash();

	if(streamName != '') {
		if(!userIDHash) { // no userIDHash means first run
			insertFirstRunMessage();
			bindFistRun();
		} else {
			// no error callback allowed due to cross domain
			// so, if all data isn't gathered within 10 seconds
			// then self detruct 
			var serverTimeout = setTimeout(function(){
				dataFailure('init');
			}, 10000);

			// first get communityTags	
			$.ajax({
				url: tkServerHREF + 'read.php?function=communityTags&streamName=' + streamName,
				cache: false,
				dataType: 'text',
				success: function(response) {
					console.assert(suppressLog, 'call:' + this.url + '\nresponse:' + response);
					convertLocalCommunityTags(response);
					// next get userTags
					$.ajax({
						url: tkServerHREF + 'read.php?function=userTags&streamName=' + streamName + '&userIDHash=' + userIDHash,
						cache: false,
						dataType: 'text',
						success: function(response) {
							console.assert(suppressLog, 'call:' + this.url + '\nresponse:' + response);
							convertLocalUserTags(response);
							// next get searchTags
							$.ajax({
								url: tkServerHREF + 'read.php?function=searchTags',
								cache: false,
								dataType: 'text',
								success: function(response) {
									console.assert(suppressLog, 'call:' + this.url + '\nresponse:' + response);
									clearTimeout(serverTimeout);
									convertLocalSearchTags(response);
									// got all data, now start
									afterData();
								},
							});
						},
					});
				},
			});
		}
	} // not a stream so do nothing
}


//
function afterData() {
	createTotals();
	insertNewTagInput();
	bindTagInputEvents();	

	fillTagHolder();
	resizeTagHolder();
	removeUserFlagged();
	updateAllTagsUserHighlight();
	bindTagHolderEvents();	

	insertSearchBar();
	bindSearchBarEvents();	

	// send any data to server every 5 seconds to reduce load
	// this leaves the possibility that the user will leave the
	// page before saving.  if so, changes will be lost but
	// no error will occur
	var serverTimeout = setInterval(function(){
		readServerQ();
	}, 5000);
}

//
function getSteamName() {
	var str = '';
	var path = location.pathname; 
	var rejectPaths = ['/directory','/products','/p','/user','/broadcast','/popout','/chat'];
	for(var i=0; i<rejectPaths.length; i++) {
		if(path.indexOf(rejectPaths[i]) > -1) {
			return str;
		}
	}
	path = path.substr(1);
	if(path.indexOf('/') > -1) {
		path = path.substr(0,path.indexOf('/')-1);
	}
	str = path;
	return str;
}

//
function getuserIDHash() {
	// Note, there's no login system, so delete the cookie to create a new user.  
	// Tags won't follow user between between browsers and devices.
	// Local ID is a salted hash of the user's ID on the server.
	// This prevents using JS to immitate or destroy other users
	var str = readCookie('twitchplustags_userIDHash');
	return str;
}

function createTotals() {
	for(var i=0; i<communityTags.length; i++) {
		var item = communityTags[i].votes;
		item.total = item.ups - item.downs; 
	}
	for(var i=0; i<searchTags.length; i++) {
		var item = searchTags[i].votes;
		item.total = item.ups - item.downs; 
	}
}

function insertStyles() {
	var str = '';
	str += '<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.1.0/css/font-awesome.min.css">';
	str += '<link rel="stylesheet" type="text/css" href="' + chrome.extension.getURL('styles.css') + '">';
	str += '<link rel="stylesheet" type="text/css" href="' + chrome.extension.getURL('jquery-ui.css') + '">';

	$('HEAD').append(str);
}

function insertHolders() {
	if(twitchResultsHolder.length == 0) {
		// logged out
		twitchResultsHolder = $('#nav_primary');
	}
	if(twitchActions.length != 1 || twitchSearch.length != 1 || twitchSearchHolder.length != 1 || twitchResultsHolder.length != 1) {
		// twitch changed their element IDs so add a holder
		var str = '';
		str += '<div id="tk_missingElHolder">';
		str += '<a href="#" id="tk_showHide">Twitch+Tags - Sorry!  Twitch changed their webpage so we\'ll have to keep tags down here until the next time I update this broswer app.</a>';
		str += '<div id="tk_slider"><div id="tk_tagAddHolder"></div>';
		str += '<div id="tk_tagHolder"></div>';
		str += '<div id="tk_searchResults"></div>';
		str += '<div id="tk_searchBar"></div>';
		str += '</div></div>';
		$('BODY').append(str);
		// ensure it's visible
		/*
		var highest = 0;   
		$('DIV').each(function() {
		    // always use a radix when using parseInt
		    var current = parseInt($(this).css('zIndex'), 10);
		    if(current > highest) {
		        highest = current;
		    }
		});
	    $('#tk_missingElHolder').css('zIndex',highest+1);
		*/
	    $('#tk_showHide').data('closed','true');
	    bindMissingELHolderEvents();
	} else {
		str = '<div id="tk_tagAddHolder"></div>';
		$(twitchActions).wrap('<div id="tk_actionsHolder"></div>');
		$(twitchActions).parent().append(str);
		str = '<div id="tk_tagHolder"></div>';
		$(twitchActions).parent().after(str);
		str = '<div id="tk_searchBar"></div>';
		$(twitchSearch).after(str);
		str = '<div id="tk_searchResults"></div>';
		$(twitchResultsHolder).before(str);
	}
}

// 
function insertFirstRunMessage() {
	// Welcome new user and tell them what to do with extension
	// 'got it!' button 
	var str = '';
	str = '<div id="tk_firstRun">Thanks for installing the Twitch+Tags browser app :^)  <strong>Please tag as many streamers as you can!</strong>  Community members depend on each other to add tags, especially while we\'re still in beta.  Each streamers\'s tags will be displayed right here.   To discover new streams, use the tag search bar right under the twitch search bar.  To begin, click \'Got it!\'</div><button id="tk_firstRunButton" class="button primary">Got it!</a>';
	$('#tk_tagHolder').html(str);
}

//
function bindFistRun() {
	// first run button
	$('#tk_firstRunButton').click(function(event) {
		createNewUser();
		return false;
	});
}

//
function createNewUser() {
	$.ajax({
		url: tkServerHREF + 'write.php?function=newUser',
		cache: false,
		dataType: 'text',
		success: function(response) {
			console.assert(suppressLog, 'call:' + this.url + '\nresponse:' + response);
			$('#tk_firstRun').remove();
			$('#tk_firstRunButton').remove();
			if(response.indexOf('tku_') == -1) {
				// a valid server responce will start with 'tku_'
				dataFailure('user');
			} else {
				// server sends a salted hash of the users ID
				// this creates the new user's local ID 
				document.cookie = 'twitchplustags_userIDHash=' + response + '; expires=Sat, 20 Apr 2024 00:04:20 GMT';
				getData();
			}
		},
	});	

}

function bindMissingELHolderEvents() {
	$('#tk_showHide').click(function(event) {
		if($(this).data('closed') == 'true') {
			$('#tk_slider').animate({
				height: '150px'
			}, 200, function() {
				$('#tk_slider').css('overflow','auto');
			});
			$(this).data('closed','false');
		} else {
			$('#tk_slider').animate({
				height: '0px'
			}, 200, function() {
				$('#tk_slider').css('overflow','hidden');
			});
			$(this).data('closed','true');
		}
		return false;
	})
}














//                    ==========================
//
//
//                    NEW TAG INPUT FUNCTIONS
//
//
//                    ==========================

// 
function insertNewTagInput() {
	var str = '';
	str += '<input id="tk_tagInput" value="Add a new tag!">';
	str += '<div id="tk_tagSuggestions">';
	str += '<div id="tk_suggestionTitle">Add a Popular Tag</div>';
	str += '</div>';
	$('#tk_tagAddHolder').append(str);

	// filter out searchTags that have already been entered
	var suggestionTags = searchTags.slice(0); // need to preserve searchTags
	var iL=communityTags.length;
	for(var i=0; i<iL; i++) {
		for(var j=0; j<suggestionTags.length; j++) {
			if(suggestionTags[j].tagName == communityTags[i].tagName) {
				suggestionTags.splice(j,1);
				break;
			}
		}
	}

	// sort searchTags by ups
	suggestionTags.sort(function(a, b) {
		var aSort = a.votes.total;
		var bSort = b.votes.total;
		return bSort-aSort;
	});	

	// add them to the list
	for(var i=0; i<suggestionTags.length && i<16; i++) {
		str = '<a href="#" class="tk_suggestionRow">' + suggestionTags[i].tagName + '</a>';
		$('#tk_tagSuggestions').append(str);
	}

	// keep list from pushing page down
	var x = (suggestionTags.length+1)*tagSuggestionHeight*-1;
	$('#tk_tagSuggestions').css('margin-bottom',x + 'px');
}

// 
function bindTagInputEvents() {

	//
	// INPUT
	//
	$('#tk_tagInput').mouseover(function(event) {
		clearTimeout(suggestTimeout);
		$('#tk_tagSuggestions').css('visibility','visible');
		$('#tk_tagSuggestions').css('opacity','0');
		$('#tk_tagSuggestions').fadeTo(200,1);
	});

	//
	$('#tk_tagInput').mouseout(function(event) {
		suggestTimeout = setTimeout(function(){
			$('#tk_tagSuggestions').fadeTo(200,0,function() {
				$('#tk_tagSuggestions').css('visibility','hidden');
			});
		}, 250);
	});

	//
	$('#tk_tagInput').focus(function(event) {
		if(this.value == 'Add a new tag!' || $(this).data('error') == 'true') {
			this.value = '';
			$(this).data('error','false');
		}
		$(this).css('color',tagInputColor);
		$(this).css('background-color',tagInputColorBG);
	});

	//
	$('#tk_tagInput').blur(function(event) {
		if(this.value == '') {
			this.value = 'Add a new tag!';	
		}
		$(this).css('color','');
	});

	//
	$('#tk_tagInput').keyup(function(event) {
		var i = this.selectionStart;
		var j = this.selectionEnd;
		var str = this.value;
		// tag name sanitizing rules:
		// limit to 16 characters
		// convert to lowercase
		// strip non-alphanumeric (except dash)
		// convert spaces to dashes
		// strip initial dash
		// convert multiple dashes to single dash
		str = str.substr(0,16); 
		str = str.toLowerCase();
		str = str.replace(/[^a-z\s0-9-]/gi,'');
		str = str.replace(' ','-');
		str = str.replace(/^-/,'');
		str = str.replace(/-+/g,'-');
		this.value = str;
		this.selectionStart = i;
		this.selectionEnd = j;
		var keycode = (event.keyCode ? event.keyCode : event.which);
		if(keycode == '13') { // enter
			// strip trailing dash
			str = str.replace(/-$/,'');
			if(str.length < 4) {
				// warn too short
				this.value = 'Sorry! That\'s too short';
				$(this).css('background-color',tagInputErrorColorBG);
				$(this).data('error','true')
				this.blur();
			} else {
				var tagName = str;
				var match = false;
				for(var i=0; i<communityTags.length; i++) {
					if(communityTags[i].tagName == tagName) {
						match = true;
						break;
					}
				}
				if(match) {
					// warn tag exists
					this.value = 'Tag already in use!';
					$(this).css('background-color',tagInputErrorColorBG);
					$(this).data('error','true')
					this.blur();
				} else {
					createNewTag(tagName);
				}
				$('#tk_tagSuggestions').css('visibility','hidden');
				this.value = '';
				this.blur();
			}
		}
	});

	//
	// SUGGESTION LIST
	//
	$('#tk_tagSuggestions').mouseover(function(event) {
		clearTimeout(suggestTimeout);
	});

	//
	$('#tk_tagSuggestions').mouseout(function(event) {
		suggestTimeout = setTimeout(function(){
			$('#tk_tagSuggestions').fadeTo(200,0,function(){
					$('#tk_tagSuggestions').css('visibility','hidden');
				});
		}, 250);
	});

	//
	$('.tk_suggestionRow').click(function(event) {
		var tagName = $(this).html();
		createNewTag(tagName);
		// remove from suggestions
		$(this).remove();
		return false;
	});
}

function createNewTag(tagName) {
	var aL = 0;
	// add to communityTags
	aL = communityTags.length;
	communityTags[aL] = {};
	communityTags[aL].tagName = tagName;
	communityTags[aL].votes = {};
	communityTags[aL].votes.ups = 1;
	communityTags[aL].votes.downs = 0;
	communityTags[aL].votes.flags = 0;
	communityTags[aL].votes.total = 1;
	// add to userTags
	al = userTags.length;
	userTags[aL] = {};
	userTags[aL].tagName = tagName;
	userTags[aL].votes = {};
	userTags[aL].votes.up = true;
	userTags[aL].votes.down = false;
	userTags[aL].votes.flag = false;
	// add tag to DOM
	var tagHTML = tagTemplate;
	tagHTML = tagHTML.replace(/\$TN\$/g,tagName);
	tagHTML = tagHTML.replace('$VT$','1');
	$('#tk_tagHolder').prepend(tagHTML);
	var el = $('#tk_tag_' + tagName);
	$(el).css('opacity','0');
	$(el).fadeTo(500,1);
	$(el).css('background-color',userTagColorBG);
	$(el).find('.tk_tagButtonUp I').toggleClass('fa-thumbs-o-up fa-thumbs-up');
	serverQ[serverQ.length] = {
		tagName: tagName,
		voteType: 'up',
		polarity: 1
	};
}











//                    ==========================
//
//
//                    EXISTING TAGS FUNCTIONS
//
//
//                    ==========================

// 
function fillTagHolder() {
	var str = '';
	// sort communityTags by total
	communityTags.sort(function(a, b) {
		var aSort = a.votes.total;
		var bSort = b.votes.total;
		return bSort-aSort;
	});	
	// add them to the list
	for(var i=0; i<communityTags.length; i++) {
		var item = communityTags[i];
		var tagHTML = tagTemplate;
		tagHTML = tagHTML.replace(/\$TN\$/g,item.tagName);
		tagHTML = tagHTML.replace('$VT$',item.votes.total);
		$('#tk_tagHolder').append(tagHTML);
	}
	// no tags message
	if(communityTags.length == 0) {
		str = '<div id="tk_noTagsMessage">Twitch+Tags:  Be the first person to add a tag to this stream!</div>';
		$('#tk_tagHolder').append(str);
	}

	// add show more link
	str = '<a id="tk_tagSizer" href="#">show more tags</a>';
	$('#tk_tagAddHolder').append(str);
	$('#tk_tagSizer').data('size','small');
	$('#tk_tagHolder').css('max-height',tagHolderSmallHeight + 'px')

	// add about link
	str = '<a id="tk_aboutLink" href="#">Twitch+Tags FAQ</a>';
	$('#tk_tagAddHolder').append(str);
}

//
function removeUserFlagged() {
	for(var i=0; i<userTags.length; i++) {
		if(userTags[i].votes.flag) {
			$('#tk_tag_' + userTags[i].tagName).remove();
		}
	}
}

function resizeTagHolder() {
	if($(twitchPlayer).length == 1) {
		var x = $(twitchPlayer).width();
		x -= 400;
		$('#tk_tagHolder').css('width',x + 'px')
	}
}

// highlight any communityTags the user has previously contributed to
function updateAllTagsUserHighlight() {
	for(var j=0; j<userTags.length; j++) {
		var el = $('#tk_tag_' + userTags[j].tagName);
		var userVotes = userTags[j].votes;
		if(userVotes.up || userVotes.down) {
			$(el).css('background-color',userTagColorBG);
		} else {
			$(el).css('background-color','');			
		}

		if(userVotes.up) {
			$(el).find('.tk_tagButtonUp I').toggleClass('fa-thumbs-o-up fa-thumbs-up');
		}
		if(userVotes.down) {
			$(el).find('.tk_tagButtonDown I').toggleClass('fa-thumbs-o-down fa-thumbs-down');
		}
	}
}

//
function updateThisTagTotalDisplay(el,tagName) {
	for(var i=0; i<communityTags.length; i++) {
		if(communityTags[i].tagName == tagName) {
			$(el).find('.tk_tagTotal').html(communityTags[i].votes.total);
			break;
		}
	}
}

// 
function bindTagHolderEvents() {
	//
	$('#tk_tagSizer').click(function(event) {
		if($(this).data('size') == 'small') {
			$('#tk_tagHolder').css('max-height','10000px');
			$(this).data('size','large');
			$(this).html('show less tags');
		} else {
			$('#tk_tagHolder').css('max-height',tagHolderSmallHeight + 'px');
			$(this).data('size','small');
			$(this).html('show more tags');
		}
		return false;
	});

	//
	$('#tk_aboutLink').click(function(event) {
		var str = '';
		str += '<div id="tk_aboutClickZone"></div>';
		str += '<div href="#" id="tk_aboutModal"><div>';
		str += '<strong>Information Twitch+Tags collects:</strong>';
		str += '<span>The only information this browser app collects is the set of tags that you add and/or vote on.  T+T <i>never</i> accesses or stores your Twitch login name, nor your password, nor your viewing habits.  You are identified by an anonymous browser cookie.  To delete your votes, delete the T+T cookie or uninstall the app.</span>'
		str += '<strong>How to help or report a issue:</strong>';
		str += '<span>Thanks!  First, please keep tagging the streams that you visit.  If you like this app, please tell other people about it.  To report an issue or make a comment send me a <a href="http://www.twitch.tv/message/compose?to=jmattthew" target="_blank">twitch message</a>.</span>';
		str += '<strong>This is an open-source, fan supported project:</strong>';
		str += '<span>Neither this browser app nor it\'s contributors are affiliated with Twitch Interactive, Inc. in any way.  Thanks for installing!</span>';
		str += '</div></div>';
		$('BODY').append(str);

		// position it
	    var docWidth = $( window ).width();
    	var docHeight = $( window ).height();
    	$('#tk_aboutClickZone').css('height',docHeight + 'px');
    	$('#tk_aboutClickZone').css('width',docWidth + 'px');
    	var x = parseInt((docWidth-500)/2);
    	var y = parseInt((docHeight-$('#tk_aboutModal').height())/2);
		$('#tk_aboutModal').css('top',y + 'px'); 
		$('#tk_aboutModal').css('left',x + 'px');

		// bindings
		$('#tk_aboutClickZone').click(function(event) {
			$('#tk_aboutModal').remove();
			$('#tk_aboutClickZone').remove();
			$('BODY').off('keyup');
		});
		$('BODY').keyup(function(event) {
			$('#tk_aboutModal').remove();
			$('#tk_aboutClickZone').remove();
			$('BODY').off('keyup');
		});

		return false;
	});

	//
	$('.tk_tagButtonUp').click(function(event) {
		var tagName = $(this).parent().attr('id').substr(7);
		var tag = $(this).parent();
		userVote('up',tagName);
		updateThisTagTotalDisplay(tag,tagName);
		// toggle highlight
		if($(tag).css('background-color') == userTagColorBG) {
			$(tag).css('background-color','');			
		} else {
			$(tag).css('background-color',userTagColorBG);
		}
		// toggle thumb
		$(this).find('I').toggleClass('fa-thumbs-o-up fa-thumbs-up');
		// up and down cancel each other out
		if($(tag).find('.fa-thumbs-up').length == 0 && $(tag).find('.fa-thumbs-down').length > 0) {
			$(tag).find('.tk_tagButtonUp I').toggleClass('fa-thumbs-o-up fa-thumbs-up');
			$(tag).find('.tk_tagButtonDown I').toggleClass('fa-thumbs-o-down fa-thumbs-down');
		} 
		return false;
	});

	//
	$('.tk_tagButtonUp').mouseover(function(event) {
		$(this).find('I').toggleClass('fa-thumbs-o-up fa-thumbs-up');
	});

	//
	$('.tk_tagButtonUp').mouseout(function(event) {
		$(this).find('I').toggleClass('fa-thumbs-o-up fa-thumbs-up');
	});

	//
	$('.tk_tagButtonDown').click(function(event) {
		var tagName = $(this).parent().attr('id').substr(7);
		var tag = $(this).parent();
		userVote('down',tagName);
		updateThisTagTotalDisplay(tag,tagName);
		// toggle highlight
		if($(tag).css('background-color') == userTagColorBG) {
			$(tag).css('background-color','');			
		} else {
			$(tag).css('background-color',userTagColorBG);
		}
		// toggle thumb
		$(this).find('I').toggleClass('fa-thumbs-o-down fa-thumbs-down');
		// up and down cancel each other out
		if($(tag).find('.fa-thumbs-up').length > 0 && $(tag).find('.fa-thumbs-down').length == 0) {
			$(tag).find('.tk_tagButtonUp I').toggleClass('fa-thumbs-o-up fa-thumbs-up');
			$(tag).find('.tk_tagButtonDown I').toggleClass('fa-thumbs-o-down fa-thumbs-down');
		} 
		return false;
	});

	//
	$('.tk_tagButtonDown').mouseover(function(event) {
		$(this).find('I').toggleClass('fa-thumbs-o-down fa-thumbs-down');
	});

	//
	$('.tk_tagButtonDown').mouseout(function(event) {
		$(this).find('I').toggleClass('fa-thumbs-o-down fa-thumbs-down');
	});

	//
	$('.tk_tagButtonFlag').click(function(event) {
		var el = $(this).parent();
		var tagName = $(el).attr('id').substr(7);
		// display confirm
		$(this).css('display','none');
		var str = '';
		str += '<span class="tk_flagConfirm">';
		str += '<span>Flag as offensive &amp; hide forever?</span>';
		str += '<a href="#" id="tk_flagNo_' + tagName + '">no</a>';
		str += '<a href="#" id="tk_flagYes_' + tagName + '">yes</a></span>';
		$(el).append(str);
		// bind confirm events
		$('#tk_flagNo_' + tagName).click(function(event) {
			$(this).parent().remove();
			$('#tk_tag_' + tagName).find('.tk_tagButtonFlag').css('display','');
			return false;
		});
		$('#tk_flagYes_' + tagName).click(function(event) {
			$('#tk_tag_' + tagName).fadeTo(200,0,function() {
				$('#tk_tag_' + tagName).remove();
			});
			userVote('flag',tagName);
			return false;
		});
		return false;
	});

	//
	$(window).resize(function() {
		resizeTagHolder();
	});

}

// update local arrays and save to server
function userVote(voteType, tagName) {
	var polarity = 0; 
	// 1 = adding vote
	// -1 = subtracting vote
	var num = -1;

	// update userTags
	for(var i=0; i<userTags.length; i++) {
		if(userTags[i].tagName == tagName) {
			num = i;
			break;
		}
	}

	if(num > -1) { 
		// user has voted on this tag, so toggle it
		userTags[num].votes[voteType] = !userTags[num].votes[voteType];
		(userTags[num].votes[voteType]) ? polarity += 1 : polarity -= 1;
		// up and down votes cancel each other out
		if(userTags[num].votes.up && userTags[num].votes.down) {
			userTags[num].votes.up = false;
			userTags[num].votes.down = false;
		}
		// if user removed all votes, remove tag from array
		if(!userTags[num].votes.up && !userTags[num].votes.down && !userTags[num].votes.flag) {
			userTags.splice(num,1);
		}
	} else {	
		// user hasn't voted on this tag, so add to userTags
		var aL = userTags.length;
		userTags[aL] = {};
		userTags[aL].tagName = tagName;
		userTags[aL].votes = {};
		userTags[aL].votes.up = false;
		userTags[aL].votes.down = false;
		userTags[aL].votes.flag = false;
		userTags[aL].votes[voteType] = true;
		polarity = 1;
	}

	voteType = voteType + 's';

	// update communityTags (userVote can only be called by existing communityTag)
	for(var i=0; i<communityTags.length; i++) {
		if(communityTags[i].tagName == tagName) {
			o = communityTags[i].votes;
			o[voteType] += polarity;
			o.total = o.ups - o.downs;
			break;
		}
	}

	// update searchTags (communityTags and searchTags are partially overlapping sets)
	for(var i=0; i<searchTags.length; i++) {
		if(searchTags[i].tagName == tagName) {
			o = searchTags[i].votes;
			o[voteType] += polarity;
			o.total = o.ups - o.downs;
			break;
		}
	}

	// send to queue
	serverQ[serverQ.length] = {
		tagName: tagName,
		voteType: voteType,
		polarity: polarity
	};
}












//                    ==========================
//
//
//                    SEARCH FUNCTIONS
//
//
//                    ==========================

// 
function insertSearchBar() {
	// make space for new search bor
	var t = $(twitchSearchHolder).css('top');
	t = t.substr(0,t.length-2);
	var y = parseInt(t)+50;
	$(twitchSearchHolder).css('top',y+'px');
	$('#tk_searchBar').html('<input id="tk_tagSearch" value="Enter Search Tags">');

	var str = '';
	// add results title and closer
	str += '<div id="tk_srTitle">';
	str += '<span>Steams with Those Tags</span>';
	str += '<a href="#">hide</a></div>';
	$('#tk_searchResults').append(str);
	$('#tk_searchResults').css('display','none');

	for(var i=0; i<searchTags.length; i++) {
		availableTags[i] = searchTags[i].tagName;
	}
}

// 
function bindSearchBarEvents() {

	//
	$('#tk_tagSearch').focus(function(event) {
		if(this.value == 'Enter Search Tags') {
			this.value = '';
		}
		$(this).css('color',tagSearchColor);
	});

	//
	$('#tk_tagSearch').blur(function(event) {
		if(this.value == '') {
			this.value = 'Enter Search Tags';	
		}
		$(this).css('color','');
	});

	// 
	$('#tk_tagSearch').keyup(function(event) {
		var i = this.selectionStart;
		var j = this.selectionEnd;
		var str = this.value;
		str = str.toLowerCase();
		str = str.replace(/[^a-z\s0-9-,]/gi,'');
		str = str.replace(/^-/,'');
		str = str.replace(/-+/g,'-');
		this.value = str;
		this.selectionStart = i;
		this.selectionEnd = j;
		var keycode = (event.keyCode ? event.keyCode : event.which);
		if(keycode == '13') { // enter
			// strip trailing dash
			str = str.replace(/-$/,'');
			// strip spaces
			str = str.replace(' ','');
			getSearchResults(str);
			this.value = '';
			this.blur();
		}
	}); 

	//
	$('#tk_srTitle').find('A').click(function(event) {
		$('#tk_searchResults').css('display','none');
		return false;
	});

	// jquery.UI
	function split( val ) {
		return val.split( /,\s*/ );
	}
	function extractLast( term ) {
		return split( term ).pop();
	}

	//
	$('#tk_tagSearch')
		.bind('keydown', function( event ) {
			// don't navigate away from the field on tab when selecting an item
			if (event.keyCode === $.ui.keyCode.TAB &&
			$(this).autocomplete('instance').menu.active) {
				event.preventDefault();
			}
		})
		.autocomplete({
			minLength: 0,
			source: function( request, response ) {
				// delegate back to autocomplete, but extract the last term
				response( $.ui.autocomplete.filter(
				availableTags, extractLast( request.term ) ) );
			},
			focus: function() {
				// prevent value inserted on focus
				return false;
			},
			select: function( event, ui ) {
				var terms = split( this.value );
				// remove the current input
				terms.pop();
				// add the selected item
				terms.push( ui.item.value );
				// add placeholder to get the comma-and-space at the end
				terms.push( "" );
				this.value = terms.join( ", " );
				return false;
		}
	});
}	

// 
function getSearchResults(searchTerms) {
	var serverTimeout = setTimeout(function(){
		dataFailure('search');
	}, 10000);

	$.ajax({
		url: tkServerHREF + 'read.php?function=searchResults&searchTerms=' + searchTerms,
		cache: false,
		dataType: 'text',
		success: function(response) {
			console.assert(suppressLog, 'call:' + this.url + '\nresponse:' + response);
			clearTimeout(serverTimeout);
			convertLocalSearchResults(response);
			populateSearchResults();
		},
	});	
}

function populateSearchResults() {
	// merge tags from same stream and find total
	for(var i=0; i<searchResults.length; i++) {
		q1 = searchResults[i];
		q1.total = q1.matchedTags[0].total;
		for(var j=i+1; j<searchResults.length; j++) {
			q2 = searchResults[j];
			if(q1.streamName == q2.streamName) {
				q1.matchedTags[q1.matchedTags.length] = q2.matchedTags[0];
				q1.total += q2.matchedTags[0].total;
				searchResults.splice(j,1);
				j -=1;
			}
		}
	}

	// sort streams by total
	searchResults.sort(function(a, b) {
		var aSort = a.total;
		var bSort = b.total;
		return bSort-aSort;
	});	

	var str = '';

	// update DOM with results
	str = '';
	if(searchResults.length > 0) {
		$('.tk_srRow').remove();
		for(var i=0; i<searchResults.length; i++) {
			str += '<a href="#" class="tk_srRow">';
			str += '<div class="tk_srStream">' + searchResults[i].streamName + '</div>';
			str += '<div class="tk_srTags">';
			for(var j=0; j<searchResults[i].matchedTags.length; j++) {
				str += '<div class="tk_srTag"><div class="tk_srTagName">' + searchResults[i].matchedTags[j].tagName + '</div>';
				str += '<div class="tk_srTotal">' + searchResults[i].matchedTags[j].total + '</div></div>';
			}
			str += '</div>';
			str += 	'</a>'		
		}
		$('#tk_searchResults').append(str);
	
		// bind row events
		$('.tk_srRow').click(function(event) {
			$(this).attr('href','http://twitch.tv/' + $(this).find('.tk_srStream').html());
		});

	}

	// show the title
	$('#tk_searchResults').css('display','block');

}










//                    ==========================
//
//
//                    SERVER FUNCTIONS
//
//
//                    ==========================

function readServerQ() {
	// remove mutally-canceling votes from queue
	for(var i=0; i<serverQ.length; i++) {
		var q1 = serverQ[i];
		for(var j=i+1; j<serverQ.length; j++) {
			var q2 = serverQ[j];
			if(q1.tagName == q2.tagName && q1.voteType == q2.voteType) {
				q1.polarity += q2.polarity;
				serverQ.splice(j,1);
				j -=1;
			}
		}
	}
	for(var i=0; i<serverQ.length; i++) {
		if(serverQ[i].polarity == 0) {
			serverQ.splice(i,1);
			i -=1;
		}
	}	

	sendEntryServerQ();
}

function sendEntryServerQ() {
	if(serverQ.length > 0) {
		var tagName = serverQ[0].tagName;
		var voteType = serverQ[0].voteType;
		var polarity = serverQ[0].polarity;

		var serverTimeout = setTimeout(function(){
			dataFailure('update');
		}, 10000);

		$.ajax({
			url: tkServerHREF + 'write.php?function=updateTag&streamName=' + streamName + '&userIDHash=' + userIDHash + '&tagName=' + tagName + '&voteType=' + voteType,
			cache: false,
			dataType: 'text',
			success: function(response) {
				console.assert(suppressLog, 'call:' + this.url + '\nresponse:' + response);
				if(response.indexOf(':::success') > -1) {
					// server response may include debug messages
					// but it must also send :::success
					clearTimeout(serverTimeout);
				}
				serverQ.splice(0,1);
				sendEntryServerQ();				
			},
		});	
	}
}

function convertLocalCommunityTags(str) {
	// a valid server response looks like this:
	// tagName1,a1,b1,c1|tagName2,a1,b1,c1|
	// where a, b, & c must be non-negative integers
	// there's no limit on the number of tags sent
	if(str.charAt(str.length-1) == '|') {
		// strip trailing separator symbol 
	    str = str.substr(0,str.length-1);
	}
	var phpTags = str.split('|');
	var num = 0;
	for(var i=0; i<phpTags.length; i++) {
		var phpInfo = phpTags[i].split(',');
		if(phpInfo.length == 4) {
			if(parseInt(phpInfo[1])==0 && parseInt(phpInfo[2])==0 && parseInt(phpInfo[3])==0) {
				// current we never delete info from the DB
				// but we won't locally include communityTags with no votes
			} else if(parseInt(phpInfo[3]) > flagTolerance) {
				// current we never delete info from the DB
				// but we won't locally include tags that have been flagged too much
			} else {
				communityTags[num] = {};
				communityTags[num].tagName = phpInfo[0];
				communityTags[num].votes = {};
				communityTags[num].votes.ups = parseInt(phpInfo[1]);
				communityTags[num].votes.downs = parseInt(phpInfo[2]);
				communityTags[num].votes.flags = parseInt(phpInfo[3]);
				num++;
			}
		}
	}
}

function convertLocalUserTags(str) {
	// a valid server response looks like this:
	// tagName1,a1,b1,c1|tagName2,a1,b1,c1|
	// where a, b, & c must be 0 or 1
	// there's no limit on the number of tags sent
	if(str.charAt(str.length-1) == '|') {
		// strip trailing separator symbol 
	    str = str.substr(0,str.length-1);
	}
	var phpTags = str.split('|');
	var num = 0;
	for(var i=0; i<phpTags.length; i++) {
		var phpInfo = phpTags[i].split(',');
		if(phpInfo.length == 4) {
			if(parseInt(phpInfo[1])==0 && parseInt(phpInfo[2])==0 && parseInt(phpInfo[3])==0) {
				// current we never delete info from the DB
				// but we won't locally include userTags with no votes
			} else {
				var bool = false;
				userTags[num] = {};
				userTags[num].tagName = phpInfo[0];
				userTags[num].votes = {};
				(parseInt(phpInfo[1]) == 0) ? bool = false : bool = true;
				userTags[num].votes.up = bool;
				(parseInt(phpInfo[2]) == 0) ? bool = false : bool = true;
				userTags[num].votes.down = bool;
				(parseInt(phpInfo[3]) == 0) ? bool = false : bool = true;
				userTags[num].votes.flag = bool;
				num++;
			}
		}
	}
}

function convertLocalSearchTags(str) {
	// a valid server response looks like this:
	// tagName1,a1,b1,c1|tagName2,a1,b1,c1|
	// where a, b, & c must be non-negative integers
	// a maximum of 128 tags will be sent
	if(str.charAt(str.length-1) == '|') {
		// strip trailing separator symbol 
	    str = str.substr(0,str.length-1);
	}
	var phpTags = str.split('|');
	var num = 0;
	for(var i=0; i<phpTags.length; i++) {
		var phpInfo = phpTags[i].split(',');
		if(phpInfo.length == 3) {
			searchTags[num] = {};
			searchTags[num].tagName = phpInfo[0];
			searchTags[num].votes = {};
			searchTags[num].votes.ups = parseInt(phpInfo[1]);
			searchTags[num].votes.downs = parseInt(phpInfo[2]);
			num++;
		}
	}
}

function convertLocalSearchResults(str) {
	// a valid server response looks like this:
	// streamName1,tagName1,a1|streamName2,tagName2,a2|
	// where a must b a non-negative integer
	// there's no limit to the number of streams sent
	if(str.charAt(str.length-1) == '|') {
		// strip trailing separator symbol 
	    str = str.substr(0,str.length-1);
	}
	var phpTags = str.split('|');
	var num = 0;
	for(var i=0; i<phpTags.length; i++) {
		var phpInfo = phpTags[i].split(',');
		if(phpInfo.length == 3) {
			if(parseInt(phpInfo[1])==0 && parseInt(phpInfo[2])==0 && parseInt(phpInfo[3])==0) {
				// current we never delete info from the DB
				// but we won't locally include searchResults with no votes
			} else {
				searchResults[num] = {};
				searchResults[num].streamName = phpInfo[0];
				searchResults[num].matchedTags = [];
				searchResults[num].matchedTags[0] = {};
				searchResults[num].matchedTags[0].tagName = phpInfo[1];
				searchResults[num].matchedTags[0].total = parseInt(phpInfo[2]);
				num++;
			}
		}
	}
	if(num == 0) {
		dataFailure('noResults');
	}
}

function dataFailure(type) {
  	var str = '';
  	console.log('T+T dataFailure: ' + type);
	str += 'Twitch+Tags: Sorry, I can\'t communicate with the T+T server. It\'s probably a temporary problem. Try refreshing the page. If the error persists, send me a <a href="http://www.twitch.tv/message/compose?to=jmattthew" target="_blank">Twitch message</a> and I\'ll look into it.';
	if(type == 'init' || type == 'user' || type == 'update') {
		// disable all functionality
    	$('#tk_tagAddHolder').css('display','none');
    	$('#tk_searchBar').css('display','none');
    	$('#tk_searchResults').css('display','none');
    	if($('#tk_fail').length == 0) {
	    	$('#tk_tagHolder').append('<div id="tk_fail"></div>');
	    	$('#tk_fail').html(str);
		}
	} else {
		$('.tk_srRow').remove();
		if(type == 'noResults') {
			str = 'No streams found with those tags.';
		}
		$('#tk_searchResults').append('<div class="tk_srRow"><div class="tk_srStream">' + str + '</div></div>');
	}
}









//                    ==========================
//
//
//                    MISC FUNCTIONS
//
//
//                    ==========================

//
function readCookie(name) {
	var nameEQ = name + "=";
	var ca = document.cookie.split(';');
	for(var i=0;i < ca.length;i++) {
		var c = ca[i];
		while (c.charAt(0)==' ') c = c.substring(1,c.length);
		if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
	}
	return null;
}

// a bunch of fake data for testing without PHP
// shows the local data-format
// ============================================
function createTestData() {
	/*
	// communityTags
	communityTags[0] = {};
	communityTags[0].tagName = 'male';
	communityTags[0].votes = {};
	communityTags[0].votes.ups = 40;
	communityTags[0].votes.downs = 10;
	communityTags[0].votes.flags = 0;
	communityTags[1] = {};
	communityTags[1].tagName = 'female';
	communityTags[1].votes = {};
	communityTags[1].votes.ups = 1;
	communityTags[1].votes.downs = 5;
	communityTags[1].votes.flags = 0;
	communityTags[2] = {};
	communityTags[2].tagName = 'poopoo-head';
	communityTags[2].votes = {};
	communityTags[2].votes.ups = 200;
	communityTags[2].votes.downs = 190;
	communityTags[2].votes.flags = 5;
	communityTags[3] = {};
	communityTags[3].tagName = 'aaaaaaaaaaaaaaaa';
	communityTags[3].votes = {};
	communityTags[3].votes.ups = 1;
	communityTags[3].votes.downs = 1;
	communityTags[3].votes.flags = 1;
	communityTags[4] = {};
	communityTags[4].tagName = 'bbbbbbbbbbbbbbb';
	communityTags[4].votes = {};
	communityTags[4].votes.ups = 1;
	communityTags[4].votes.downs = 1;
	communityTags[4].votes.flags = 1;
	communityTags[5] = {};
	communityTags[5].tagName = 'cccccccccc';
	communityTags[5].votes = {};
	communityTags[5].votes.ups = 1;
	communityTags[5].votes.downs = 1;
	communityTags[5].votes.flags = 1;
	communityTags[6] = {};
	communityTags[6].tagName = 'ddddddd';
	communityTags[6].votes = {};
	communityTags[6].votes.ups = 1;
	communityTags[6].votes.downs = 1;
	communityTags[6].votes.flags = 1;
	communityTags[7] = {};
	communityTags[7].tagName = 'eeee';
	communityTags[7].votes = {};
	communityTags[7].votes.ups = 0;
	communityTags[7].votes.downs = 1;
	communityTags[7].votes.flags = 1;
	communityTags[8] = {};
	communityTags[8].tagName = 'wwwwwwwwwwwwwwww';
	communityTags[8].votes = {};
	communityTags[8].votes.ups = 1;
	communityTags[8].votes.downs = 1;
	communityTags[8].votes.flags = 1;

	// userTags
	userTags[0] = {};
	userTags[0].tagName = 'male';
	userTags[0].votes = {};
	userTags[0].votes.up = true;
	userTags[0].votes.down = false;
	userTags[0].votes.flag = false;
	userTags[1] = {};
	userTags[1].tagName = 'poopoo-head';
	userTags[1].votes = {};
	userTags[1].votes.up = false;
	userTags[1].votes.down = true;
	userTags[1].votes.flag = true;
	userTags[2] = {};
	userTags[2].tagName = 'eeee';
	userTags[2].votes = {};
	userTags[2].votes.up = false;
	userTags[2].votes.down = true;
	userTags[2].votes.flag = false;

	// searchTags
	searchTags[0] = {};
	searchTags[0].tagName = 'female';
	searchTags[0].votes = {};
	searchTags[0].votes.ups = 50;
	searchTags[0].votes.downs = 5;
	searchTags[0].votes.flags = 0;
	searchTags[1] = {};
	searchTags[1].tagName = 'male';
	searchTags[1].votes = {};
	searchTags[1].votes.ups = 100;
	searchTags[1].votes.downs = 10;
	searchTags[1].votes.flags = 1;
	searchTags[2] = {};
	searchTags[2].tagName = 'poopoo-head';
	searchTags[2].votes = {};
	searchTags[2].votes.ups = 10;
	searchTags[2].votes.downs = 9;
	searchTags[2].votes.flags = 20;
	searchTags[3] = {};
	searchTags[3].tagName = 'english';
	searchTags[3].votes = {};
	searchTags[3].votes.ups = 25;
	searchTags[3].votes.downs = 50;
	searchTags[3].votes.flags = 0;
	searchTags[4] = {};
	searchTags[4].tagName = 'minecraft';
	searchTags[4].votes = {};
	searchTags[4].votes.ups = 25;
	searchTags[4].votes.downs = 50;
	searchTags[4].votes.flags = 0;

	// search results
	searchResults[0] = {};
	searchResults[0].streamName = 'seriesRunner';
	searchResults[0].matchedTags = [];
	searchResults[0].matchedTags[0] = {};
	searchResults[0].matchedTags[0].tagName = 'male';
	searchResults[0].matchedTags[0].total = 8;

	searchResults[1] = {};
	searchResults[1].streamName = 'seriesRunner';
	searchResults[1].matchedTags = [];
	searchResults[1].matchedTags[0] = {};
	searchResults[1].matchedTags[0].tagName = 'english';
	searchResults[1].matchedTags[0].total = 4;

	searchResults[2] = {};
	searchResults[2].streamName = 'valdudes';
	searchResults[2].matchedTags = [];
	searchResults[2].matchedTags[0] = {};
	searchResults[2].matchedTags[0].tagName = 'male';
	searchResults[2].matchedTags[0].total = 16;

	searchResults[3] = {};
	searchResults[3].streamName = 'valdudes';
	searchResults[3].matchedTags = [];
	searchResults[3].matchedTags[0] = {};
	searchResults[3].matchedTags[0].tagName = 'female';
	searchResults[3].matchedTags[0].total = 1;
	*/
}






