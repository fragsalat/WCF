"use strict";

/**
 * Namespace for comments
 */
WCF.Comment = { };

/**
 * Comment support for WCF
 * 
 * @author	Alexander Ebert
 * @copyright	2001-2017 WoltLab GmbH
 * @license	GNU Lesser General Public License <http://opensource.org/licenses/lgpl-license.php>
 */
WCF.Comment.Handler = Class.extend({
	/**
	 * list of comment buttons per comment
	 * @var	object
	 */
	_commentButtonList: { },
	
	/**
	 * list of comment objects
	 * @var	object
	 */
	_comments: { },
	
	/**
	 * comment container object
	 * @var	jQuery
	 */
	_container: null,
	
	/**
	 * container id
	 * @var	string
	 */
	_containerID: '',
	
	/**
	 * number of currently displayed comments
	 * @var	integer
	 */
	_displayedComments: 0,
	
	/**
	 * button to load next comments
	 * @var	jQuery
	 */
	_loadNextComments: null,
	
	/**
	 * buttons to load next responses per comment
	 * @var	object
	 */
	_loadNextResponses: { },
	
	/**
	 * action proxy
	 * @var	WCF.Action.Proxy
	 */
	_proxy: null,
	
	/**
	 * list of response objects
	 * @var	object
	 */
	_responses: { },
	
	/**
	 * user's avatar (48px version)
	 * @var	string
	 */
	_userAvatar: '',
	
	/**
	 * user's avatar (32px version)
	 * @var	string
	 */
	_userAvatarSmall: '',
	
	/**
	 * data of the comment the active guest user is about to create
	 * @var	object
	 */
	_commentData: { },
	
	/**
	 * guest dialog with username input field and recaptcha
	 * @var	jQuery
	 */
	_guestDialog: null,
	
	_permalinkComment: null,
	_permalinkResponse: null,
	_scrollTarget: null,
	
	/**
	 * Initializes the WCF.Comment.Handler class.
	 * 
	 * @param	string		containerID
	 * @param	string		userAvatar
	 * @param	string		userAvatarSmall
	 */
	init: function(containerID, userAvatar, userAvatarSmall) {
		this._commentButtonList = { };
		this._comments = { };
		this._containerID = containerID;
		this._displayedComments = 0;
		this._loadNextComments = null;
		this._loadNextResponses = { };
		this._permalinkComment = null;
		this._permalinkResponse = null;
		this._responses = { };
		this._scrollTarget = null;
		this._userAvatar = userAvatar;
		this._userAvatarSmall = userAvatarSmall;
		
		this._container = $('#' + $.wcfEscapeID(this._containerID));
		if (!this._container.length) {
			console.debug("[WCF.Comment.Handler] Unable to find container identified by '" + this._containerID + "'");
			return;
		}
		
		this._proxy = new WCF.Action.Proxy({
			failure: $.proxy(this._failure, this),
			success: $.proxy(this._success, this)
		});
		
		this._initComments();
		this._initResponses();
		
		// add new comment
		if (this._container.data('canAdd')) {
			if (elBySel('.commentListAddComment .wysiwygTextarea', this._container[0]) === null) {
				console.debug("Missing WYSIWYG implementation, adding comments is not available.");
			}
			else {
				require(['WoltLabSuite/Core/Ui/Comment/Add'], (function (UiCommentAdd) {
					new UiCommentAdd(elBySel('.jsCommentAdd',  this._container[0]));
				}).bind(this));
			}
		}
		
		require(['WoltLabSuite/Core/Ui/Comment/Edit'], (function (UiCommentEdit) {
			new UiCommentEdit(this._container[0]);
		}).bind(this));
		
		WCF.DOMNodeInsertedHandler.execute();
		WCF.DOMNodeInsertedHandler.addCallback('WCF.Comment.Handler', $.proxy(this._domNodeInserted, this));
		
		WCF.System.ObjectStore.add('WCF.Comment.Handler', this);
		
		window.addEventListener('hashchange', function () {
			var hash = window.location.hash;
			if (hash && hash.match(/.+\/(comment\d+)/)) {
				var commentId = RegExp.$1;
				
				// delay scrolling in case a tab menu change was requested
				window.setTimeout(function () {
					var comment = elById(commentId);
					if (comment) comment.scrollIntoView({ behavior: 'smooth' });
				}, 100);
			}
		});
		
		var hash = window.location.hash;
		if (hash.match(/^#(?:[^\/]+\/)?comment(\d+)(?:\/response(\d+))?/)) {
			var comment = elById('comment' + RegExp.$1);
			if (comment) {
				var response;
				if (RegExp.$2) {
					response = elById('comment' + RegExp.$1 + 'response' + RegExp.$2);
					if (response) {
						this._scrollTo(response, true);
					}
					else {
						// load response on-the-fly
						this._loadResponseSegment(comment, RegExp.$1, RegExp.$2);
					}
				}
				else {
					this._scrollTo(comment, true);
				}
			}
			else {
				// load comment on-the-fly
				this._loadCommentSegment(RegExp.$1, RegExp.$2);
			}
		}
	},
	
	_scrollTo: function (element, highlight) {
		if (this._scrollTarget === null) {
			this._scrollTarget = elCreate('span');
			this._scrollTarget.className = 'commentScrollTarget';
			
			document.body.appendChild(this._scrollTarget);
		}
		
		this._scrollTarget.style.setProperty('top', (element.getBoundingClientRect().top + window.pageYOffset - 49) + 'px', '');
		
		require(['Ui/Scroll'], (function (UiScroll) {
			UiScroll.element(this._scrollTarget, function () {
				if (highlight) {
					if (element.classList.contains('commentHighlightTarget')) {
						element.classList.remove('commentHighlightTarget');
						//noinspection BadExpressionStatementJS
						element.offsetTop;
					}
					
					element.classList.add('commentHighlightTarget');
				}
			})
		}).bind(this));
	},
	
	_loadCommentSegment: function (commentId, responseID) {
		this._permalinkComment = elCreate('li');
		this._permalinkComment.className = 'commentPermalinkContainer loading';
		this._permalinkComment.innerHTML = '<span class="icon icon48 fa-spinner"></span>';
		this._container[0].insertBefore(this._permalinkComment, this._container[0].firstChild);
		
		this._proxy.setOption('data', {
			actionName: 'loadComment',
			className: 'wcf\\data\\comment\\CommentAction',
			objectIDs: [commentId],
			parameters: {
				data: {
					objectID: this._container.data('objectID'),
					objectTypeID: this._container.data('objectTypeID'),
					responseID: ~~responseID
				}
			}
		});
		this._proxy.sendRequest();
	},
	
	_loadResponseSegment: function (comment, commentId, responseID) {
		this._permalinkResponse = elCreate('li');
		this._permalinkResponse.className = 'commentResponsePermalinkContainer loading';
		this._permalinkResponse.innerHTML = '<span class="icon icon32 fa-spinner"></span>';
		var responseList = elBySel('.commentResponseList', comment);
		responseList.insertBefore(this._permalinkResponse, responseList.firstChild);
		
		this._proxy.setOption('data', {
			actionName: 'loadResponse',
			className: 'wcf\\data\\comment\\CommentAction',
			objectIDs: [commentId],
			parameters: {
				data: {
					objectID: this._container.data('objectID'),
					objectTypeID: this._container.data('objectTypeID'),
					responseID: ~~responseID
				}
			}
		});
		this._proxy.sendRequest();
	},
	
	/**
	 * Shows a button to load next comments.
	 */
	_handleLoadNextComments: function() {
		if (this._displayedComments < this._container.data('comments')) {
			if (this._loadNextComments === null) {
				this._loadNextComments = $('<li class="commentLoadNext showMore"><button class="small">' + WCF.Language.get('wcf.comment.more') + '</button></li>').appendTo(this._container);
				this._loadNextComments.children('button').click($.proxy(this._loadComments, this));
			}
			
			this._loadNextComments.children('button').enable();
		}
		else if (this._loadNextComments !== null) {
			this._loadNextComments.remove();
		}
	},
	
	/**
	 * Shows a button to load next responses per comment.
	 * 
	 * @param	integer		commentID
	 */
	_handleLoadNextResponses: function(commentID) {
		var $comment = this._comments[commentID];
		$comment.data('displayedResponses', $comment.find('ul.commentResponseList > li').length);
		
		if ($comment.data('displayedResponses') < $comment.data('responses')) {
			if (this._loadNextResponses[commentID] === undefined) {
				var $difference = $comment.data('responses') - $comment.data('displayedResponses');
				this._loadNextResponses[commentID] = $('<li class="jsCommentLoadNextResponses"><a>' + WCF.Language.get('wcf.comment.response.more', { count: $difference }) + '</a></li>').appendTo(this._commentButtonList[commentID]);
				this._loadNextResponses[commentID].children('a').data('commentID', commentID).click($.proxy(this._loadResponses, this));
				this._commentButtonList[commentID].parent().show();
			}
		}
		else if (this._loadNextResponses[commentID] !== undefined) {
			var $showAddResponse = this._loadNextResponses[commentID].next();
			this._loadNextResponses[commentID].remove();
			if ($showAddResponse.length) {
				$showAddResponse.trigger('click');
			}
		}
	},
	
	/**
	 * Loads next comments.
	 */
	_loadComments: function() {
		this._loadNextComments.children('button').disable();
		
		this._proxy.setOption('data', {
			actionName: 'loadComments',
			className: 'wcf\\data\\comment\\CommentAction',
			parameters: {
				data: {
					objectID: this._container.data('objectID'),
					objectTypeID: this._container.data('objectTypeID'),
					lastCommentTime: this._container.data('lastCommentTime')
				}
			}
		});
		this._proxy.sendRequest();
	},
	
	/**
	 * Loads next responses for given comment.
	 * 
	 * @param	object		event
	 */
	_loadResponses: function(event) {
		this._loadResponsesExecute($(event.currentTarget).disable().data('commentID'), false);
	},
	
	/**
	 * Executes loading of comments, optionally fetching all at once.
	 * 
	 * @param	integer		commentID
	 * @param	boolean		loadAllResponses
	 */
	_loadResponsesExecute: function(commentID, loadAllResponses) {
		this._proxy.setOption('data', {
			actionName: 'loadResponses',
			className: 'wcf\\data\\comment\\response\\CommentResponseAction',
			parameters: {
				data: {
					commentID: commentID,
					lastResponseTime: this._comments[commentID].data('lastResponseTime'),
					loadAllResponses: (loadAllResponses ? 1 : 0)
				}
			}
		});
		this._proxy.sendRequest();
	},
	
	/**
	 * Handles DOMNodeInserted events.
	 */
	_domNodeInserted: function() {
		this._initComments();
		this._initResponses();
	},
	
	/**
	 * Initializes available comments.
	 */
	_initComments: function() {
		var link = elBySel('link[rel="canonical"]');
		if (link) {
			link = link.href;
		}
		else {
			link = window.location.toString().replace(/#.+$/, '');
		}
		
		// check if comments are within a tab menu
		var tab = this._container[0].closest('.tabMenuContent');
		if (tab) {
			link += '#' + elData(tab, 'name');
		}
		
		var self = this;
		var $loadedComments = false;
		this._container.find('.jsComment').each(function(index, comment) {
			var $comment = $(comment).removeClass('jsComment');
			var $commentID = $comment.data('commentID');
			self._comments[$commentID] = $comment;
			
			// permalink anchor
			$comment[0].id = 'comment' + $commentID;
			
			var $insertAfter = $comment.find('ul.commentResponseList');
			if (!$insertAfter.length) $insertAfter = $comment.find('.commentContent');
			
			var $container = $('<div class="commentOptionContainer" />').hide().insertAfter($insertAfter);
			self._commentButtonList[$commentID] = $('<ul class="inlineList dotSeparated" />').appendTo($container);
			
			self._handleLoadNextResponses($commentID);
			self._initComment($commentID, $comment);
			self._initPermalink($comment[0], link);
			self._displayedComments++;
			
			$loadedComments = true;
		});
		
		if ($loadedComments) {
			this._handleLoadNextComments();
		}
	},
	
	/**
	 * Initializes a specific comment.
	 * 
	 * @param	integer		commentID
	 * @param	jQuery		comment
	 */
	_initComment: function(commentID, comment) {
		if (this._container.data('canAdd')) {
			this._initAddResponse(commentID, comment);
		}
		
		if (comment.data('canEdit')) {
			var $editButton = $('<li><a href="#" class="jsCommentEditButton jsTooltip" title="' + WCF.Language.get('wcf.global.button.edit') + '"><span class="icon icon16 fa-pencil" /> <span class="invisible">' + WCF.Language.get('wcf.global.button.edit') + '</span></a></li>');
			$editButton.appendTo(comment.find('ul.buttonList:eq(0)'));
		}
		
		if (comment.data('canDelete')) {
			var $deleteButton = $('<li><a href="#" class="jsTooltip" title="' + WCF.Language.get('wcf.global.button.delete') + '"><span class="icon icon16 fa-times" /> <span class="invisible">' + WCF.Language.get('wcf.global.button.delete') + '</span></a></li>');
			$deleteButton.data('commentID', commentID).appendTo(comment.find('ul.buttonList:eq(0)')).click($.proxy(this._delete, this));
		}
		
		var enableComment = elBySel('.jsEnableComment', comment[0]);
		if (enableComment) {
			enableComment.addEventListener(WCF_CLICK_EVENT, this._enableComment.bind(this));
		}
	},
	
	_enableComment: function (event) {
		event.preventDefault();
		
		var comment = event.currentTarget.closest('.comment');
		
		this._proxy.setOption('data', {
			actionName: 'enable',
			className: 'wcf\\data\\comment\\CommentAction',
			objectIDs: [elData(comment, 'object-id')]
		});
		this._proxy.sendRequest();
	},
	
	_initPermalink: function(comment, link) {
		var anchor = elCreate('a');
		anchor.href = link + (link.indexOf('#') === -1 ? '#' : '/') + 'comment' + elData(comment, 'object-id');
		
		var time = elBySel('.commentContent:not(.commentResponseContent) .containerHeadline time', comment);
		time.parentNode.insertBefore(anchor, time);
		anchor.appendChild(time);
	},
	
	/**
	 * Initializes available responses.
	 */
	_initResponses: function() {
		var link = elBySel('link[rel="canonical"]');
		if (link) {
			link = link.href;
		}
		else {
			link = window.location.toString().replace(/#.+$/, '');
		}
		
		// check if comments are within a tab menu
		var tab = this._container[0].closest('.tabMenuContent');
		if (tab) {
			link += '#' + elData(tab, 'name');
		}
		
		for (var commentId in this._comments) {
			if (this._comments.hasOwnProperty(commentId)) {
				elBySelAll('.jsCommentResponse', this._comments[commentId][0], (function(response) {
					var $response = $(response).removeClass('jsCommentResponse');
					var $responseID = $response.data('responseID');
					this._responses[$responseID] = $response;
					
					//noinspection JSReferencingMutableVariableFromClosure
					response.id = 'comment' + commentId + 'response' + $responseID;
						
					this._initResponse($responseID, $response);
					
					//noinspection JSReferencingMutableVariableFromClosure
					this._initPermalinkResponse(commentId, response, $responseID, link);
					
					var enableResponse = elBySel('.jsEnableResponse', response);
					if (enableResponse) {
						enableResponse.addEventListener(WCF_CLICK_EVENT, this._enableCommentResponse.bind(this));
					}
				}).bind(this));
			}
		}
	},
	
	_enableCommentResponse: function (event) {
		event.preventDefault();
		
		var response = event.currentTarget.closest('.commentResponse');
		
		this._proxy.setOption('data', {
			actionName: 'enableResponse',
			className: 'wcf\\data\\comment\\CommentAction',
			parameters: {
				data: {
					responseID: elData(response, 'object-id')
				}
			}
		});
		this._proxy.sendRequest();
	},
	
	_initPermalinkResponse: function (commentId, response, responseId, link) {
		var anchor = elCreate('a');
		anchor.href = link + (link.indexOf('#') === -1 ? '#' : '/') + 'comment' + commentId + '/response' + responseId;
		
		var time = elBySel('.commentResponseContent .containerHeadline time', response);
		time.parentNode.insertBefore(anchor, time);
		anchor.appendChild(time);
	},
	
	/**
	 * Initializes a specific response.
	 * 
	 * @param	integer		responseID
	 * @param	jQuery		response
	 */
	_initResponse: function(responseID, response) {
		if (response.data('canEdit')) {
			var $editButton = $('<li><a href="#" class="jsTooltip" title="' + WCF.Language.get('wcf.global.button.edit') + '"><span class="icon icon16 fa-pencil" /> <span class="invisible">' + WCF.Language.get('wcf.global.button.edit') + '</span></a></li>');
			
			var self = this;
			$editButton.data('responseID', responseID).appendTo(response.find('ul.buttonList:eq(0)')).click(function(event) { self._prepareEdit(event, true); });
		}
		
		if (response.data('canDelete')) {
			var $deleteButton = $('<li><a href="#" class="jsTooltip" title="' + WCF.Language.get('wcf.global.button.delete') + '"><span class="icon icon16 fa-times" /> <span class="invisible">' + WCF.Language.get('wcf.global.button.delete') + '</span></a></li>');
			
			var self = this;
			$deleteButton.data('responseID', responseID).appendTo(response.find('ul.buttonList:eq(0)')).click(function(event) { self._delete(event, true); });
		}
	},
	
	/**
	 * Initializes the UI elements to add a response.
	 * 
	 * @param	integer		commentID
	 * @param	jQuery		comment
	 */
	_initAddResponse: function(commentID, comment) {
		var $placeholder = $('<li class="jsCommentShowAddResponse"><a>' + WCF.Language.get('wcf.comment.button.response.add') + '</a></li>').data('commentID', commentID).click($.proxy(this._showAddResponse, this)).appendTo(this._commentButtonList[commentID]);
		
		var $listItem = $('<div class="box32 commentResponseAdd jsCommentResponseAdd">' + this._userAvatarSmall + '<div /></div>').hide();
		$listItem.appendTo(this._commentButtonList[commentID].parent().show());
		
		var $inputContainer = $listItem.children('div');
		var $input = $('<textarea placeholder="' + WCF.Language.get('wcf.comment.response.add') + '" maxlength="65535" class="long" />').data('commentID', commentID).appendTo($inputContainer).flexible();
		$('<button class="small">' + WCF.Language.get('wcf.global.button.submit') + '</button>').click($.proxy(function(event) { this._save(event, true); }, this)).appendTo($inputContainer);
		
		var self = this;
		$input.keyup(function(event) { self._keyUp(event, true); });
		
		comment.data('responsePlaceholder', $placeholder).data('responseInput', $listItem);
		
		// mirror the moderation notice
		var commentRequireApproval = elBySel('.commentListAddCommentEditorContainer .jsCommentAddRequiresApproval', this._container[0]);
		if (commentRequireApproval) {
			$inputContainer[0].insertBefore(commentRequireApproval.cloneNode(true), $inputContainer[0].firstChild);
		}
	},
	
	/**
	 * Prepares editing of a comment or response.
	 * 
	 * @param	object		event
	 * @param	boolean		isResponse
	 */
	_prepareEdit: function(event, isResponse) {
		if (!isResponse) {
			throw new Error("Editing comments is no longer supported through this method.");
		}
		
		event.preventDefault();
		var $button = $(event.currentTarget);
		var $data = {
			objectID: this._container.data('objectID'),
			objectTypeID: this._container.data('objectTypeID'),
			responseID: $button.data('responseID')
		};
		
		this._proxy.setOption('data', {
			actionName: 'prepareEdit',
			className: 'wcf\\data\\comment\\CommentAction',
			parameters: {
				data: $data
			}
		});
		this._proxy.sendRequest();
	},
	
	/**
	 * Displays the UI elements to create a response.
	 * 
	 * @param	object		event
	 */
	_showAddResponse: function(event) {
		var $placeholder = $(event.currentTarget);
		var $commentID = $placeholder.data('commentID');
		if ($placeholder.prev().hasClass('jsCommentLoadNextResponses')) {
			this._loadResponsesExecute($commentID, true);
			$placeholder.parent().children('.button').disable();
		}
		
		$placeholder.hide();
		
		var $responseInput = this._comments[$commentID].data('responseInput').show();
		$responseInput.find('textarea').focus();
		
		$responseInput.parents('.commentOptionContainer').addClass('jsAddResponseActive');
	},
	
	/**
	 * Handles the keyup event for comments and responses.
	 * 
	 * @param	object		event
	 * @param	boolean		isResponse
	 */
	_keyUp: function(event, isResponse) {
		if (event.which === $.ui.keyCode.ESCAPE) {
			// cancel input
			$(event.currentTarget).val('').trigger('blur', event).trigger('updateHeight');
			
			return;
		}
		else if (event.which === $.ui.keyCode.ENTER && event.ctrlKey) {
			this._save(null, isResponse, $(event.currentTarget));
			
			return false;
		}
	},
	
	/**
	 * Saves entered comment/response.
	 * 
	 * @param	object		event
	 * @param	boolean		isResponse
	 * @param	jQuery		input
	 */
	_save: function(event, isResponse, input) {
		if (!isResponse) {
			throw new Error("Adding comments through `_save()` is no longer supported.");
		}
		
		var $input = (event === null) ? input : $(event.currentTarget).parent().children('textarea');
		$input.next('small.innerError').remove();
		var $value = $.trim($input.val());
		
		// ignore empty comments
		if ($value == '') {
			return;
		}
		
		var $data = {
			commentID: $input.data('commentID'),
			message: $value,
			objectID: this._container.data('objectID'),
			objectTypeID: this._container.data('objectTypeID')
		};
		
		if (!WCF.User.userID) {
			this._commentData = $data;
			
			// check if guest dialog has already been loaded
			this._proxy.setOption('data', {
				actionName: 'getGuestDialog',
				className: 'wcf\\data\\comment\\CommentAction',
				parameters: {
					data: {
						message: $value,
						objectID: this._container.data('objectID'),
						objectTypeID: this._container.data('objectTypeID')
					}
				}
			});
			this._proxy.sendRequest();
		}
		else {
			new WCF.Action.Proxy({
				autoSend: true,
				data: {
					actionName: 'addResponse',
					className: 'wcf\\data\\comment\\CommentAction',
					parameters: {
						data: $data
					}
				},
				success: $.proxy(this._success, this),
				failure: (function(data, jqXHR, textStatus, errorThrown) {
					if (data.returnValues && data.returnValues.fieldName) {
						if (data.returnValues.fieldName === 'text' && data.returnValues.errorType) {
							$('<small class="innerError">' + data.returnValues.errorType + '</small>').insertAfter($input);
							
							return false;
						}
					}
					
					this._failure(data, jqXHR, textStatus, errorThrown);
				}).bind(this)
			});
		}
	},
	
	/**
	 * Shows a confirmation message prior to comment or response deletion.
	 * 
	 * @param	object		event
	 * @param	boolean		isResponse
	 */
	_delete: function(event, isResponse) {
		event.preventDefault();
		WCF.System.Confirmation.show(WCF.Language.get('wcf.comment.delete.confirmMessage'), $.proxy(function(action) {
			if (action === 'confirm') {
				var $data = {
					objectID: this._container.data('objectID'),
					objectTypeID: this._container.data('objectTypeID')
				};
				if (isResponse !== true) {
					$data.commentID = $(event.currentTarget).data('commentID');
				}
				else {
					$data.responseID = $(event.currentTarget).data('responseID');
				}
				
				this._proxy.setOption('data', {
					actionName: 'remove',
					className: 'wcf\\data\\comment\\CommentAction',
					parameters: {
						data: $data
					}
				});
				this._proxy.sendRequest();
			}
		}, this));
	},
	
	/**
	 * Handles a failed AJAX request.
	 * 
	 * @param	object		data
	 * @param	object		jqXHR
	 * @param	string		textStatus
	 * @param	string		errorThrown
	 * @return	boolean
	 */
	_failure: function(data, jqXHR, textStatus, errorThrown) {
		if (!WCF.User.userID && this._guestDialog) {
			// enable submit button again
			this._guestDialog.find('input[type="submit"]').enable();
		}
		
		return true;
	},
	
	/**
	 * Handles successful AJAX requests.
	 * 
	 * @param	object		data
	 * @param	string		textStatus
	 * @param	jQuery		jqXHR
	 */
	_success: function(data, textStatus, jqXHR) {
		switch (data.actionName) {
			case 'addResponse':
				if (data.returnValues.guestDialog) {
					this._createGuestDialog(data.returnValues.guestDialog, data.returnValues.useCaptcha);
				}
				else {
					var $comment = this._comments[data.returnValues.commentID];
					$comment.find('.jsCommentResponseAdd textarea').val('').blur().trigger('updateHeight');
					
					// revert response field
					elBySel('.commentOptionContainer', $comment[0]).classList.remove('jsAddResponseActive');
					elHide(elBySel('.jsCommentResponseAdd', $comment[0]));
					elShow(elBySel('.jsCommentShowAddResponse', $comment[0]));
					
					var $responseList = $comment.find('ul.commentResponseList');
					if (!$responseList.length) $responseList = $('<ul class="containerList commentResponseList" />').insertBefore($comment.find('.commentOptionContainer'));
					$(data.returnValues.template).appendTo($responseList).wcfFadeIn();
					
					if (!WCF.User.userID) {
						this._guestDialog.wcfDialog('close');
					}
				}
			break;
			
			case 'edit':
				this._update(data);
			break;
			
			case 'enable':
				this._enable(data);
				break;
				
			case 'enableResponse':
				this._enableResponse(data);
				break;
			
			case 'loadComment':
				this._insertComment(data);
				break;
			
			case 'loadComments':
				this._insertComments(data);
			break;
			
			case 'loadResponse':
				this._insertResponse(data);
				break;
			
			case 'loadResponses':
				this._insertResponses(data);
			break;
			
			case 'prepareEdit':
				this._edit(data);
			break;
			
			case 'remove':
				this._remove(data);
			break;
			
			case 'getGuestDialog':
				this._createGuestDialog(data.returnValues.template, data.returnValues.useCaptcha);
			break;
		}
		
		WCF.DOMNodeInsertedHandler.execute();
	},
	
	_enable: function(data) {
		if (data.returnValues.commentID) {
			var comment = elBySel('.comment[data-object-id="' + data.returnValues.commentID + '"]', this._container[0]);
			if (comment) {
				elData(comment, 'is-disabled', 0);
				var badge = elBySel('.jsIconDisabled', comment);
				if (badge) elRemove(badge);
				
				var enableLink = elBySel('.jsEnableComment', comment);
				if (enableLink) elRemove(enableLink.parentNode);
			}
		}
	},
	
	_enableResponse: function(data) {
		if (data.returnValues.responseID) {
			var response = elBySel('.commentResponse[data-object-id="' + data.returnValues.responseID + '"]', this._container[0]);
			if (response) {
				elData(response, 'is-disabled', 0);
				var badge = elBySel('.jsIconDisabled', response);
				if (badge) elRemove(badge);
				
				var enableLink = elBySel('.jsEnableResponse', response);
				if (enableLink) elRemove(enableLink.parentNode);
			}
		}
	},
	
	_insertComment: function (data) {
		if (data.returnValues.template === '') {
			// comment id is invalid or there is a mismatch, silently ignore it
			return;
		}
		
		// TODO: handle 'response' value
		
		$(data.returnValues.template).insertBefore(this._permalinkComment);
		var comment = this._permalinkComment.previousElementSibling;
		comment.classList.add('commentPermalinkContainer');
		
		elRemove(this._permalinkComment);
		this._permalinkComment = comment;
		
		//noinspection BadExpressionStatementJS
		comment.offsetTop;
		
		comment.classList.add('commentHighlightTarget');
	},
	
	_insertResponse: function(data) {
		if (data.returnValues.template === '') {
			// comment id is invalid or there is a mismatch, silently ignore it
			return;
		}
		
		$(data.returnValues.template).insertBefore(this._permalinkResponse);
		var response = this._permalinkResponse.previousElementSibling;
		response.classList.add('commentResponsePermalinkContainer');
		
		elRemove(this._permalinkResponse);
		this._permalinkResponse = response;
		
		//noinspection BadExpressionStatementJS
		response.offsetTop;
		
		response.classList.add('commentHighlightTarget');
	},
	
	/**
	 * Inserts previously loaded comments.
	 * 
	 * @param	object		data
	 */
	_insertComments: function(data) {
		// insert comments
		$(data.returnValues.template).insertBefore(this._loadNextComments);
		
		// update time of last comment
		this._container.data('lastCommentTime', data.returnValues.lastCommentTime);
		
		// check if permalink comment has been loaded and remove it from view
		if (this._permalinkComment) {
			var commentId = elData(this._permalinkComment, 'object-id');
			
			if (elBySel('.comment[data-object-id="' + commentId + '"]:not(.commentPermalinkContainer)', this._container[0]) !== null) {
				elRemove(this._permalinkComment);
				this._permalinkComment = null;
			}
		}
	},
	
	/**
	 * Inserts previously loaded responses.
	 * 
	 * @param	object		data
	 */
	_insertResponses: function(data) {
		var $comment = this._comments[data.returnValues.commentID];
		
		// insert responses
		$(data.returnValues.template).appendTo($comment.find('ul.commentResponseList'));
		
		// update time of last response
		$comment.data('lastResponseTime', data.returnValues.lastResponseTime);
		
		// update button state to load next responses
		this._handleLoadNextResponses(data.returnValues.commentID);
		
		// check if permalink response has been loaded and remove it from view
		if (this._permalinkResponse) {
			var responseId = elData(this._permalinkResponse, 'object-id');
			
			if (elBySel('.commentResponse[data-object-id="' + responseId + '"]:not(.commentPermalinkContainer)', this._container[0]) !== null) {
				elRemove(this._permalinkResponse);
				this._permalinkResponse = null;
			}
		}
	},
	
	/**
	 * Removes a comment or response from list.
	 * 
	 * @param	object		data
	 */
	_remove: function(data) {
		if (data.returnValues.commentID) {
			this._comments[data.returnValues.commentID].remove();
			delete this._comments[data.returnValues.commentID];
		}
		else {
			var $response = this._responses[data.returnValues.responseID];
			var $comment = this._comments[$response.parents('li.comment:eq(0)').data('commentID')];
			
			// decrease response counter as a correct response count
			// is required in _handleLoadNextResponses()
			$comment.data('responses', parseInt($comment.data('responses')) - 1);
			
			var $commentResponseList = $response.parent();
			$response.remove();
			
			if (!$commentResponseList.children().length) {
				// make '.commentResponseList' accessible via CSS'
				// :empty selector
				$commentResponseList.empty();
			}
			
			delete this._responses[data.returnValues.responseID];
		}
	},
	
	/**
	 * Prepares editing of a comment or response.
	 * 
	 * @param	object		data
	 */
	_edit: function(data) {
		var $content;
		if (data.returnValues.commentID) {
			$content = this._comments[data.returnValues.commentID].find('.commentContent:eq(0) .userMessage:eq(0)');
		}
		else {
			$content = this._responses[data.returnValues.responseID].find('.commentContent:eq(0) .userMessage:eq(0)');
		}
		
		// replace content with input field
		$content.html($.proxy(function(index, oldHTML) {
			var $textarea = $('<textarea class="long" maxlength="65535" />').val(data.returnValues.message);
			$textarea.data('__html', oldHTML).keyup($.proxy(this._keyUpEdit, this));
			
			if (data.returnValues.commentID) {
				$textarea.data('commentID', data.returnValues.commentID);
			}
			else {
				$textarea.data('responseID', data.returnValues.responseID);
			}
			
			return $textarea;
		}, this));
		var $textarea = $content.children('textarea');
		$('<button class="small">' + WCF.Language.get('wcf.global.button.submit') + '</button>').insertAfter($textarea).click($.proxy(this._saveEdit, this));
		$textarea.focus().flexible();
		
		// hide elements
		$content.parent().find('.containerHeadline:eq(0)').hide();
		$content.parent().find('.buttonGroupNavigation:eq(0)').hide();
	},
	
	/**
	 * Updates a comment or response.
	 * 
	 * @param	object		data
	 */
	_update: function(data) {
		var $input;
		if (data.returnValues.commentID) {
			$input = this._comments[data.returnValues.commentID].find('.commentContent:eq(0) .userMessage:eq(0) > textarea');
		}
		else {
			$input = this._responses[data.returnValues.responseID].find('.commentContent:eq(0) .userMessage:eq(0) > textarea');
		}
		
		$input.data('__html', data.returnValues.message);
		
		this._cancelEdit($input);
	},
	
	/**
	 * Creates the guest dialog using the given template.
	 * 
	 * @param	string		template
	 * @param	boolean		useCaptcha
	 */
	_createGuestDialog: function(template, useCaptcha) {
		var $refreshGuestDialog = !!this._guestDialog;
		if (!this._guestDialog) {
			this._guestDialog = $('<div id="commentAddGuestDialog" />').hide().appendTo(document.body);
		}
		
		this._guestDialog.html(template);
		this._guestDialog.data('useCaptcha', useCaptcha);
		
		// bind submit event listeners
		this._guestDialog.find('input[type="submit"]').click($.proxy(this._submit, this));
		this._guestDialog.find('input[type="text"]').keydown($.proxy(this._keyDown, this));
		
		this._guestDialog.wcfDialog({
			'title': WCF.Language.get('wcf.comment.guestDialog.title')
		});
	},
	
	/**
	 * Handles clicking enter in the input fields of the guest dialog by
	 * submitting it.
	 * 
	 * @param	Event		event
	 */
	_keyDown: function(event) {
		if (event.which === $.ui.keyCode.ENTER) {
			this._submit();
		}
	},
	
	/**
	 * Handles submitting the guest dialog.
	 * 
	 * @param	Event		event
	 */
	_submit: function(event) {
		var $requestData = {
			actionName: 'addResponse',
			className: 'wcf\\data\\comment\\CommentAction'
		};
		
		var $data = this._commentData;
		$data.username = this._guestDialog.find('input[name="username"]').val();
		
		$requestData.parameters = {
			data: $data
		};
		
		$requestData = $.extend(WCF.System.Captcha.getData('commentAdd'), $requestData);
		
		this._proxy.setOption('data', $requestData);
		this._proxy.sendRequest();
	},
	
	/**
	 * Handles the keyup event for comments and responses during edit.
	 * 
	 * @param	object		event
	 */
	_keyUpEdit: function(event) {
		if (event.which === $.ui.keyCode.ESCAPE) {
			// cancel input
			this._cancelEdit($(event.currentTarget));
			return;
		}
		else if (event.which === $.ui.keyCode.ENTER && event.ctrlKey) {
			this._saveEdit(event);
			return false;
		}
	},
	
	/**
	 * Saves editing of a comment or response.
	 * 
	 * @param	object		event
	 */
	_saveEdit: function(event) {
		var $input = $(event.currentTarget);
		if ($input.is('button')) {
			$input.parent().children('small.innerError').remove();
			$input = $input.parent().children('textarea');
		}
		var $message = $.trim($input.val());
		
		// ignore empty message
		if ($message === '') {
			return;
		}
		
		var $data = {
			message: $message,
			objectID: this._container.data('objectID'),
			objectTypeID: this._container.data('objectTypeID')
		};
		if ($input.data('commentID')) {
			$data.commentID = $input.data('commentID');
		}
		else {
			$data.responseID = $input.data('responseID');
		}
		
		new WCF.Action.Proxy({
			autoSend: true,
			data: {
				actionName: 'edit',
				className: 'wcf\\data\\comment\\CommentAction',
				parameters: {
					data: $data
				}
			},
			success: $.proxy(this._success, this),
			failure: (function(data, jqXHR, textStatus, errorThrown) {
				if (data.returnValues && data.returnValues.fieldName) {
					if (data.returnValues.fieldName === 'text' && data.returnValues.errorType) {
						$('<small class="innerError">' + data.returnValues.errorType + '</small>').insertAfter($input);
						
						return false;
					}
				}
				
				this._failure(data, jqXHR, textStatus, errorThrown);
			}).bind(this)
		});
	},
	
	/**
	 * Cancels editing of a comment or response.
	 * 
	 * @param	jQuery		input
	 */
	_cancelEdit: function(input) {
		// restore elements
		input.parent().prev('.containerHeadline:eq(0)').show();
		input.parent().next('.buttonGroupNavigation:eq(0)').show();
		
		// restore HTML
		input.parent().html(input.data('__html'));
	}
});

/**
 * Namespace for comment responses
 */
WCF.Comment.Response = { };
