/**
 * Description: DnD
 * Author: crossjs <liwenfu@crossjs.com>
 * Date: 2014-12-22 14:01:18
 */

'use strict';

var Dnd = null;

// 依赖组件
var $ = require('nd-jquery');
var Base = require('nd-base');

var dndArray = []; // 存储dnd instance的数组
var uid = 0; // 标识dnd instance的id
var dnd = null; // 当前拖放的dnd对象
var element = null; // 当前拖放元素
var proxy = null; // 当前代理元素
var drop = null; // 当前可放置容器  note. drops则为设置的可放置容器
var diffX = 0;
var diffY = 0; // diffX, diffY记录鼠标点击离源节点的距离
var dataTransfer = {}; // 存储拖放信息，在dragstart可设置，在drop中可读取
var dragPre = false; // 标识预拖放
var dragging = false; // 标识是否正在拖放

/*
 * 判断元素B是否位于元素A内部
 * or 点(B, C)是否位于A内
 */
function isContain(A, B, C) {
  var offset = $(A).offset();

  // A is document
  if (!offset) {
    offset = {
      left: 0,
      top: 0
    };
  }

  if (arguments.length === 2) {
    return offset.left <= $(B).offset().left &&
      offset.left + $(A).outerWidth() >=
      $(B).offset().left + $(B).outerWidth() &&
      offset.top <= $(B).offset().top &&
      offset.top + $(A).outerHeight() >=
      $(B).offset().top + $(B).outerHeight();
  }
  if (arguments.length === 3) {
    return offset.left <= B &&
      offset.left + $(A).outerWidth() >= B &&
      offset.top <= C &&
      offset.top + $(A).outerHeight() >= C;
  }
}

/*
 * 鼠标按下触发预拖放
 */
function executeDragPre(event) {
  var targetArray = $(event.target).parents().toArray();

  // 查找自身和父元素，判断是否为可拖放元素
  targetArray.unshift(event.target);
  $.each(targetArray, function(index, elem) {
    if ($(elem).data('dnd') !== undefined) {
      dnd = $(elem).data('dnd');

      if (!isNaN(parseInt(dnd, 10))) {
        dnd = dndArray[parseInt(dnd, 10)];
        element = $(elem);
      } else if (dnd === true) {
        dnd = new Dnd(elem, $(elem).data('config'));
        element = $(elem);
      } else if (dnd === false) {

        // dnd为false标识禁止该元素触发拖放
        dnd = null;
      } else {

        // 继续向上寻找
        return true;
      }
      return false;
    }
  });

  // 不允许拖放则返回
  if (dnd === null || dnd.get('disabled') === true) {
    return;
  }

  // 初始化proxy
  if (dnd.get('proxy') === null) {
    proxy = element.clone();
  } else {
    proxy = dnd.get('proxy');
  }

  // 设置代理元素proxy，并将其插入element的父元素中
  // 这样保证proxy的样式与源节点element一致
  proxy.css({
    position: 'absolute',
    left: 0,
    top: 0,
    visibility: 'hidden'
  });
  proxy.appendTo(element.parent());

  // 使代理元素定位到element处
  proxy.data('originx', proxy.offset().left);
  proxy.data('originy', proxy.offset().top);
  proxy.css({
    left: element.offset().left - proxy.data('originx'),
    top: element.offset().top - proxy.data('originy'),
    width: element.width(),
    height: element.height()
  });

  // 记录鼠标点击位置与源节点element的距离
  diffX = event.pageX - element.offset().left;
  diffY = event.pageY - element.offset().top;

  dragPre = true;
}

/*
 * 鼠标拖动触发拖放
 */
function executeDragStart() {
  var visible = dnd.get('visible');
  var dragCursor = dnd.get('dragCursor');
  var zIndex = dnd.get('zIndex');

  // 按照设置显示或隐藏element
  if (visible !== true) {
    element.css('visibility', 'hidden');
  }

  // 显示proxy
  proxy.css({
    'z-index': zIndex,
    visibility: 'visible',
    cursor: dragCursor
  });
  proxy.focus();

  dataTransfer = {};
  dragPre = false;
  dragging = true;
  dnd.trigger('dragstart', dataTransfer, element);
}

/*
 * 根据边界和方向一起判断是否drag并执行
 */
function executeDrag(event) {
  var containment = dnd.get('containment');
  var axis = dnd.get('axis');
  var xleft = event.pageX - diffX;
  var xtop = event.pageY - diffY;
  var originx = proxy.data('originx');
  var originy = proxy.data('originy');
  var offset = containment.offset();

  // containment is document
  // 不用 === 是因为 jquery 版本不同，返回值也不同
  if (!offset) {
    offset = {
      left: 0,
      top: 0
    };
  }

  // 是否在x方向上移动并执行
  if (axis !== 'y') {
    if (xleft >= offset.left &&
      xleft + proxy.outerWidth() <= offset.left +
      containment.outerWidth()) {
      proxy.css('left', xleft - originx);
    } else {
      if (xleft <= offset.left) {
        proxy.css('left', offset.left - originx);
      } else {
        proxy.css('left',
          offset.left + containment.outerWidth() -
          proxy.outerWidth() - originx);
      }
    }
  }

  // 是否在y方向上移动并执行
  if (axis !== 'x') {
    if (xtop >= offset.top &&
      xtop + proxy.outerHeight() <= offset.top +
      containment.outerHeight()) {
      proxy.css('top', xtop - originy);
    } else {
      if (xtop <= offset.top) {
        proxy.css('top', offset.top - originy);
      } else {
        proxy.css('top',
          offset.top + containment.outerHeight() -
          proxy.outerHeight() - originy);
      }
    }
  }
  dnd.trigger('drag', element, drop);
}

/*
 * 根据proxy和可放置容器的相互位置来判断是否dragenter,
 * dragleave和dragover并执行
 */
function executeDragEnterLeaveOver() {
  var drops = dnd.get('drops');

  if (drops === null) {
    return;
  }

  var xleft = proxy.offset().left + diffX;
  var xtop = proxy.offset().top + diffY;

  var dropCursor = dnd.get('dropCursor');

  var activeDrop;
  $.each(drops, function(index, elem) {
    if (isContain(elem, xleft, xtop) === true) {
      proxy.css('cursor', dropCursor);
      proxy.focus();

      if (!drop || drop[0] !== elem) {
        activeDrop = $(elem);
      }
      return false; // 跳出each
    }
  });

  // changed
  if (activeDrop) {
    if (drop) {
      dnd.trigger('dragleave', element, drop);
    }
    drop = activeDrop;
    dnd.trigger('dragenter', element, drop);
    return;
  }
  // no change
  if (drop) {
    var dragCursor = dnd.get('dragCursor');

    if (isContain(drop, xleft, xtop) === false) {
      proxy.css('cursor', dragCursor);
      proxy.focus();

      dnd.trigger('dragleave', element, drop);
      drop = null;
    } else {
      dnd.trigger('dragover', element, drop);
    }
  }
}

/*
 * 根据proxy和当前的可放置容器地相互位置判断是否drop并执行
 * 当proxy不完全在drop内且不需要revert时, 将proxy置于drop中央
 */
function executeDrop() {
  var revert = dnd.get('revert');
  var originx = proxy.data('originx');
  var originy = proxy.data('originy');

  if (drop === null) {
    return;
  }

  // 放置时不完全在drop中并且不需要返回的则放置中央
  if (isContain(drop, proxy) === false && revert === false) {
    proxy.css('left', drop.offset().left +
      (drop.outerWidth() - proxy.outerWidth()) / 2 - originx);
    proxy.css('top', drop.offset().top +
      (drop.outerHeight() - proxy.outerHeight()) / 2 - originy);
  }
  dnd.trigger('drop', dataTransfer, element, drop);
}

/*
 * 根据revert判断是否要返回并执行
 * 若可放置容器drops不为null且当前可放置容器drop为null, 则自动回到原处
 * 处理完移除代理元素
 */
function executeRevert() {
  var drops = dnd.get('drops');
  var revert = dnd.get('revert');
  var revertDuration = dnd.get('revertDuration');
  var visible = dnd.get('visible');
  var zIndex = dnd.get('zIndex');
  var xleft = proxy.offset().left - element.offset().left;
  var xtop = proxy.offset().top - element.offset().top;
  var originx = proxy.data('originx');
  var originy = proxy.data('originy');

  if (revert === true || (drop === null && drops !== null)) {
    //代理元素返回源节点初始位置
    proxy.animate({
      left: element.offset().left - originx,
      top: element.offset().top - originy
    }, revertDuration, function() {
      element.css('visibility', '');
      proxy.remove();
      proxy = null;

      // 触发dragend
      dnd.trigger('dragend', element, drop);
      dnd = null;
      drop = null;
    });
  } else {

    // 源节点移动到代理元素处
    if (element.css('position') === 'relative') {
      xleft = (isNaN(parseInt(element.css('left'), 10)) ? 0 :
        parseInt(element.css('left'), 10)) + xleft;
      xtop = (isNaN(parseInt(element.css('top'), 10)) ? 0 :
        parseInt(element.css('top'), 10)) + xtop;
    } else if (element.css('position') === 'absolute') {
      xleft = proxy.offset().left - originx;
      xtop = proxy.offset().top - originy;
    } else {
      element.css('position', 'relative');
    }

    if (visible === false) {
      element.css({
        left: xleft,
        top: xtop,
        visibility: '',
        'z-index': zIndex
      });
      proxy.remove();
      proxy = null;

      // 触发dragend
      dnd.trigger('dragend', element, drop);
      dnd = null;
      drop = null;
    } else {

      // 源节点显示时，动画移动到代理元素处
      element.animate({
        left: xleft,
        top: xtop
      }, revertDuration, function() {
        proxy.remove();
        proxy = null;

        // 触发dragend
        dnd.trigger('dragend', element, drop);
        dnd = null;
        drop = null;
      });
    }
  }
}

/*
 * 核心部分, 处理鼠标按下、移动、释放事件, 实现拖放逻辑
 */
function handleEvent(event) {
  switch (event.type) {
    case 'mousedown':
      if (!proxy && event.which === 1) {

        // 检测并执行预拖放
        executeDragPre({
          target: event.target,
          pageX: event.pageX,
          pageY: event.pageY
        });

        // 阻止默认选中文本
        if (dragPre === true) {
          event.preventDefault();
        }
      }
      break;

    case 'mousemove':
      if (dragPre === true) {

        // 开始拖放
        executeDragStart();
      } else if (dragging === true) {

        // 根据边界和方向一起判断是否drag并执行
        executeDrag({
          pageX: event.pageX,
          pageY: event.pageY
        });

        // 根据proxy和可放置容器的相互位置来判断
        // 是否要dragenter, dragleave和dragover并执行
        executeDragEnterLeaveOver();

        // 阻止默认选中文本
        event.preventDefault();
      }
      break;

    case 'mouseup':
      if (dragPre === true) {

        // 点击而非拖放时
        proxy.remove();
        proxy = null;
        dnd = null;
        dragPre = false;
      } else if (dragging === true) {
        dragging = false;

        proxy.css('cursor', 'default');
        proxy.focus();

        // 根据当前的可放置容器判断是否drop并执行
        executeDrop();

        // 根据revert属性判断是否要返回并执行
        executeRevert();
      }
      break;
  }
}

Dnd = Base.extend({
  attrs: {
    // elements: {
    //   value: null,
    //   readOnly: true
    // },
    containment: {
      value: $(document),
      setter: function(val) {
        return $(val).eq(0);
      }
    },
    proxy: {
      value: null,
      setter: function(val) {
        return $(val).eq(0);
      }
    },
    drops: {
      value: null,
      setter: function(val) {
        // 反转顺序，先匹配最深的
        return $(val).toArray().reverse();
      }
    },
    disabled: false,
    visible: false,
    axis: false,
    revert: false,
    revertDuration: 500,
    dragCursor: 'move',
    dropCursor: 'copy',
    zIndex: 9999
  },

  initialize: function(config) {
    Dnd.superclass.initialize.call(this, config);

    this.uid = uid;
    dndArray[uid++] = this;
  },

  addElement: function(elem) {
    // 在源节点上存储dnd uid
    $(elem).data('dnd', this.uid);
  }
});

/*
 * 开启页面Dnd功能，绑定鼠标按下、移动、释放事件
 */
Dnd.open = function() {
  $(document).on('mousedown mousemove mouseup', handleEvent);
};

/*
 * 关闭页面Dnd功能，解绑鼠标按下、移动、释放事件
 */
Dnd.close = function() {
  $(document).off('mousedown mousemove mouseup', handleEvent);
};

// 默认关闭
// Dnd.open();

module.exports = Dnd;
