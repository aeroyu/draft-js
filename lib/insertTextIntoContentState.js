/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * 
 * @emails oncall+draft_js
 */
'use strict';

var Immutable = require("immutable");

var insertIntoList = require("./insertIntoList");

var invariant = require("fbjs/lib/invariant");

var encodeInlineStyleRanges = require("./encodeInlineStyleRanges");

var Repeat = Immutable.Repeat;

function insertTextIntoContentState(contentState, selectionState, text, characterMetadata) {
  !selectionState.isCollapsed() ? process.env.NODE_ENV !== "production" ? invariant(false, '`insertText` should only be called with a collapsed range.') : invariant(false) : void 0;
  var len = null;

  if (text != null) {
    len = text.length;
  }

  if (len == null || len === 0) {
    return contentState;
  }

  var blockMap = contentState.getBlockMap();
  var key = selectionState.getStartKey();
  var offset = selectionState.getStartOffset();
  var block = blockMap.get(key);
  var blockText = block.getText();
  console.log('insertTextIntoContentState', text, key, offset, blockMap.keySeq().findIndex(function (k) {
    return k === key;
  }), characterMetadata.getStyle());
  var newBlock = block.merge({
    text: blockText.slice(0, offset) + text + blockText.slice(offset, block.getLength()),
    characterList: insertIntoList(block.getCharacterList(), Repeat(characterMetadata, len).toList(), offset)
  });
  var newOffset = offset + len;
  return contentState.merge({
    blockMap: blockMap.set(key, newBlock),
    selectionAfter: selectionState.merge({
      anchorOffset: newOffset,
      focusOffset: newOffset
    }),
    op: getOp(true, blockMap, block, characterMetadata, text, key, offset, len)
  });
}

module.exports = insertTextIntoContentState;

function appendStyleAfterOffset(characterMetadata, ops, blockIndex, offset, len) {
  if (!characterMetadata.getStyle().isEmpty()) {
    var styleList = characterMetadata.getStyle().toList();

    for (var i = 0; i < styleList.size; i++) {
      ops.push({
        p: ['blocks', blockIndex, 'inlineStyleRanges', i],
        li: {
          offset: offset,
          length: len,
          style: styleList.get(i)
        }
      });
    }
  }
}

function getOp(enable, blockMap, block, characterMetadata, text, key, offset, len) {
  if (!enable) return null;
  var blockIndex = blockMap.keySeq().findIndex(function (k) {
    return k === key;
  });
  var ops = [{
    p: ['blocks', blockIndex, 'text', offset],
    si: text
  }];
  var blockCharacterList = block.getCharacterList();

  if (offset === blockCharacterList.count()) {
    // 句末插入
    if (!characterMetadata.isEmpty()) {
      appendStyleAfterOffset(characterMetadata, ops, blockIndex, offset, len);

      if (characterMetadata.getEntity()) {}
    }
  } else {
    var styleRanges = encodeInlineStyleRanges(block);
    var styleRangesIndex = 0;
    styleRanges.forEach(function (styleRange) {
      if (styleRange.offset >= offset) {
        ops.push({
          p: ['blocks', blockIndex, 'inlineStyleRanges', styleRangesIndex, 'offset'],
          od: styleRange.offset,
          oi: styleRange.offset + len
        });
      } else {
        var headLength = offset - styleRange.offset;
        ops.push({
          p: ['blocks', blockIndex, 'inlineStyleRanges', styleRangesIndex, 'length'],
          od: styleRange.length,
          oi: headLength
        }, {
          p: ['blocks', blockIndex, 'inlineStyleRanges', styleRangesIndex],
          li: {
            offset: offset + len,
            length: styleRange.length - headLength,
            style: styleRange.style
          }
        });
        appendStyleAfterOffset(characterMetadata, ops, blockIndex, offset, len);
      }

      styleRangesIndex++;
    });
  }

  return ops;
}