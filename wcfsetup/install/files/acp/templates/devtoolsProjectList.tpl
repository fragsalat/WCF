{include file='header' pageTitle='wcf.acp.devtools.project.list'}

<script data-relocate="true">
	$(function() {
		new WCF.Action.Delete('wcf\\data\\cronjob\\CronjobAction', '.jsObjectRow');
	});
</script>

<header class="contentHeader">
	<div class="contentHeaderTitle">
		<h1 class="contentTitle">{lang}wcf.acp.devtools.project.list{/lang}</h1>
	</div>
	
	<nav class="contentHeaderNavigation">
		<ul>
			<li><a href="{link controller='DevtoolsProjectAdd'}{/link}" class="button"><span class="icon icon16 fa-plus"></span> <span>{lang}wcf.acp.devtools.project.add{/lang}</span></a></li>
			
			{event name='contentHeaderNavigation'}
		</ul>
	</nav>
</header>

{hascontent}
	<div class="section tabularBox">
		<table class="table">
			<thead>
				<tr>
					<th class="columnID" colspan="2">{lang}wcf.global.objectID{/lang}</th>
					<th class="columnText">{lang}wcf.acp.devtools.project.name{/lang}</th>
					<th class="columnText">{lang}wcf.acp.devtools.project.path{/lang}</th>
					<th class="columnIcon">{lang}wcf.acp.devtools.project.action{/lang}</th>
					
					{event name='columnHeads'}
				</tr>
			</thead>
			
			<tbody>
				{content}
					{foreach from=$objects item=object}
						<tr class="jsObjectRow">
							<td class="columnIcon">
								<a href="{link controller='DevtoolsProjectEdit' id=$object->getObjectID()}{/link}" title="{lang}wcf.global.button.edit{/lang}" class="jsTooltip"><span class="icon icon16 fa-pencil"></span></a>
								<span class="icon icon16 fa-times jsDeleteButton jsTooltip pointer" title="{lang}wcf.global.button.delete{/lang}" data-object-id="{@$object->getObjectID()}" data-confirm-message-html="{lang __encode=true}wcf.acp.devtools.project.delete.confirmMessage{/lang}"></span>
							</td>
							<td class="columnID">{@$object->getObjectID()}</td>
							<td class="columnText"><a href="{link controller='DevtoolsProjectEdit' id=$object->getObjectID()}{/link}">{$object->name}</a></td>
							<td class="columnText"><small>{$object->path}</small></td>
							<td class="columnIcon">
								<a href="{link controller='DevtoolsProjectSync' id=$object->getObjectID()}{/link}" class="button small">{lang}wcf.acp.devtools.project.sync{/lang}</a>
							</td>
						</tr>
					{/foreach}
				{/content}
			</tbody>
		</table>
	</div>
{hascontentelse}
	<p class="info">{lang}wcf.global.noItems{/lang}</p>
{/hascontent}

<footer class="contentFooter">
	<nav class="contentFooterNavigation">
		<ul>
			<li><a href="{link controller='DevtoolsProjectAdd'}{/link}" class="button"><span class="icon icon16 fa-plus"></span> <span>{lang}wcf.acp.devtools.project.add{/lang}</span></a></li>
			
			{event name='contentFooterNavigation'}
		</ul>
	</nav>
</footer>

{include file='footer'}
