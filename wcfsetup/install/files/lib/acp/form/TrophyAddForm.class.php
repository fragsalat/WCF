<?php
namespace wcf\acp\form;
use wcf\data\category\Category;
use wcf\data\object\type\ObjectType;
use wcf\data\trophy\category\TrophyCategoryCache;
use wcf\data\trophy\Trophy;
use wcf\data\trophy\TrophyAction;
use wcf\system\condition\ConditionHandler;
use wcf\system\exception\UserInputException;
use wcf\system\language\I18nValue;
use wcf\system\trophy\condition\TrophyConditionHandler;
use wcf\system\WCF;
use wcf\util\StringUtil;

/**
 * Represents the trophy add form. 
 *
 * @author	Joshua Ruesweg
 * @copyright	2001-2017 WoltLab GmbH
 * @license	GNU Lesser General Public License <http://opensource.org/licenses/lgpl-license.php>
 * @package	WoltLabSuite\Core\Acp\Form
 * @since	3.1
 */
class TrophyAddForm extends AbstractAcpForm {
	/**
	 * @inheritDoc
	 */
	public $activeMenuItem = 'wcf.acp.menu.link.trophy.add';
	
	/**
	 * @inheritDoc
	 */
	public $neededPermissions = ['admin.trophy.canManageTrophy'];
	
	/**
	 * @inheritDoc
	 */
	public $neededModules = ['MODULE_TROPHY'];
	
	/**
	 * category id for the trophy.
	 * @var integer
	 */
	public $categoryID = 0;
	
	/**
	 * Category object.
	 * @var Category
	 */
	public $category = null;
	
	/**
	 * Trophy description.
	 * @var string
	 */
	public $description = '';
	
	/**
	 * Trophy title. 
	 * @var string
	 */
	public $title = '';
	
	/**
	 * All available trophy types. 
	 * @var []
	 */
	public $availableTypes = [
		Trophy::TYPE_IMAGE => 'image',
		Trophy::TYPE_BADGE => 'badge'
	];
	
	/**
	 * Type of the trophy (whether this is an image or not)
	 * @var int
	 */
	public $type = Trophy::TYPE_BADGE;
	
	/**
	 * the location of the uploaded icon
	 * @var string
	 */
	public $uploadIconFile = '';
	
	/**
	 * the icon name for CSS icons (FA-Icon)
	 * @var string
	 */
	public $iconName = 'trophy';
	
	/**
	 * The icon color (rgba format with rgba prefix)
	 * @var string
	 */
	public $iconColor = 'rgba(255, 255, 255, 1)';
	
	/**
	 * The badge color (rgba format with rgba prefix)
	 * @var string
	 */
	public $badgeColor = 'rgba(50, 92, 132, 1)';
	
	/**
	 * `1` if the trophy is disabled. 
	 * @var int
	 */
	public $isDisabled = 0;
	/**
	 * `1` if the trophy has conditions to reward automatically trophies. 
	 * @var int
	 */
	public $awardAutomatically = 0;
	
	/**
	 * list of grouped user group assignment condition object types
	 * @var	ObjectType[][]
	 */
	public $conditions = [];
	
	/**
	 * @inheritDoc
	 */
	public function readData() {
		$this->conditions = TrophyConditionHandler::getInstance()->getGroupedObjectTypes();
		
		parent::readData();
	}
	
	/**
	 * @inheritDoc
	 */
	public function readParameters() {
		parent::readParameters();
		
		$titleI18n = new I18nValue('title');
		$titleI18n->setLanguageItem('wcf.trophy.title', 'wcf.trophy', 'com.woltlab.wcf');
		$this->registerI18nValue($titleI18n);
		
		$descriptionI18n = new I18nValue('description');
		$descriptionI18n->setLanguageItem('wcf.trophy.description', 'wcf.trophy', 'com.woltlab.wcf');
		$this->registerI18nValue($descriptionI18n);
	}
	
	/**
	 * @inheritDoc
	 */
	public function readFormParameters() {
		parent::readFormParameters();
		
		if (isset($_POST['categoryID'])) $this->categoryID = intval($_POST['categoryID']);
		if (isset($_POST['type'])) $this->type = intval($_POST['type']);
		if (isset($_POST['isDisabled'])) $this->isDisabled = intval($_POST['isDisabled']);
		if (isset($_POST['uploadIconFile'])) $this->uploadIconFile = StringUtil::trim($_POST['uploadIconFile']);
		if (isset($_POST['iconName'])) $this->iconName = StringUtil::trim($_POST['iconName']);
		if (isset($_POST['iconColor'])) $this->iconColor = $_POST['iconColor'];
		if (isset($_POST['badgeColor'])) $this->badgeColor = $_POST['badgeColor'];
		if (isset($_POST['awardAutomatically'])) $this->awardAutomatically = intval($_POST['awardAutomatically']);
		
		$this->category = TrophyCategoryCache::getInstance()->getCategoryByID($this->categoryID);
		
		foreach ($this->conditions as $conditions) {
			/** @var ObjectType $condition */
			foreach ($conditions as $condition) {
				$condition->getProcessor()->readFormParameters();
			}
		}
	}
	
	/**
	 * @inheritDoc
	 */
	public function validate() {
		parent::validate();
		
		if (!in_array($this->type, array_keys($this->availableTypes))) {
			throw new UserInputException('type');
		}
		
		if (!$this->categoryID) {
			throw new UserInputException('categoryID');
		}
		
		if (!$this->category->getObjectID()) {
			throw new UserInputException('categoryID');
		}
		
		switch ($this->type) {
			case Trophy::TYPE_IMAGE:
				// @TODO
				break;
			
			case Trophy::TYPE_BADGE:
				if (empty($this->iconName)) {
					throw new UserInputException('iconName');
				}
				
				if (empty($this->iconColor)) {
					throw new UserInputException('iconColor');
				}
				
				if (empty($this->badgeColor)) {
					throw new UserInputException('badgeColor');
				}
				break;
		}
		
		if ($this->awardAutomatically) {
			$hasData = false;
			foreach ($this->conditions as $conditions) {
				foreach ($conditions as $condition) {
					$condition->getProcessor()->validate();
					
					if (!$hasData && $condition->getProcessor()->getData() !== null) {
						$hasData = true;
					}
				}
			}
			
			if (!$hasData) {
				throw new UserInputException('conditions');
			}	
		}
	}
	
	/**
	 * @inheritDoc
	 */
	public function save() {
		parent::save();
		
		$data = [];
		if ($this->type == Trophy::TYPE_IMAGE) {
			// @ TODO 
		} else if ($this->type == Trophy::TYPE_BADGE) {
			$data['iconName'] = $this->iconName;
			$data['iconColor'] = $this->iconColor;
			$data['badgeColor'] = $this->badgeColor;
		}
		
		$this->objectAction = new TrophyAction([], 'create', [
			'data' => array_merge($this->additionalFields, $data, [
				'title' => $this->title,
				'description' => $this->description,
				'categoryID' => $this->categoryID,
				'type' => $this->type,
				'isDisabled' => $this->isDisabled
			])
		]);
		$this->objectAction->executeAction();
		
		// transform conditions array into one-dimensional array
		$conditions = [];
		foreach ($this->conditions as $groupedObjectTypes) {
			$conditions = array_merge($conditions, $groupedObjectTypes);
		}
		
		ConditionHandler::getInstance()->createConditions($this->objectAction->getReturnValues()['returnValues']->trophyID, $conditions);
		
		$this->reset();
	}
	
	/**
	 * @inheritDoc
	 */
	public function reset() {
		parent::reset();
		
		$this->isDisabled = $this->awardAutomatically = $this->categoryID = 0;
		$this->type = Trophy::TYPE_BADGE;
		$this->uploadIconFile = $this->iconName = '';
		$this->iconColor = 'rgba(255, 255, 255, 1)';
		$this->badgeColor = 'rgba(50, 92, 132, 1)';
		$this->iconName = 'trophy';
		
		foreach ($this->conditions as $conditions) {
			foreach ($conditions as $condition) {
				$condition->getProcessor()->reset();
			}
		}
	}
	
	/**
	 * @inheritDoc
	 */
	public function assignVariables() {
		parent::assignVariables();
		
		WCF::getTPL()->assign([
			'categoryID' => $this->categoryID,
			'type' => $this->type,
			'iconFile' => $this->uploadIconFile,
			'isDisabled' => $this->isDisabled,
			'iconName' => $this->iconName,
			'iconColor' => $this->iconColor,
			'badgeColor' => $this->badgeColor,
			'trophyCategories' => TrophyCategoryCache::getInstance()->getCategories(),
			'groupedObjectTypes' => $this->conditions, 
			'awardAutomatically' => $this->awardAutomatically,
			'availableTypes' => $this->availableTypes
		]);
	}
}