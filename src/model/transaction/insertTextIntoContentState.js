/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @emails oncall+draft_js
 */

'use strict';

const Immutable = require('immutable');
const insertIntoList = require('insertIntoList');
const invariant = require('invariant');
const encodeInlineStyleRanges = require('encodeInlineStyleRanges');
const {Repeat} = Immutable;

import type CharacterMetadata from 'CharacterMetadata';
import type ContentState from 'ContentState';
import type SelectionState from 'SelectionState';

function insertTextIntoContentState(
  contentState: ContentState,
  selectionState: SelectionState,
  text: string,
  characterMetadata: CharacterMetadata,
): ContentState {
  invariant(
    selectionState.isCollapsed(),
    '`insertText` should only be called with a collapsed range.',
  );

  let len: ?number = null;
  if (text != null) {
    len = text.length;
  }

  if (len == null || len === 0) {
    return contentState;
  }

  const blockMap = contentState.getBlockMap();
  const key = selectionState.getStartKey();
  const offset = selectionState.getStartOffset();
  const block = blockMap.get(key);
  const blockText = block.getText();
  console.log(
    'insertTextIntoContentState',
    text,
    key,
    offset,
    blockMap.keySeq().findIndex(k => k === key),
    characterMetadata.getStyle(),
  );

  const newBlock = block.merge({
    text:
      blockText.slice(0, offset) +
      text +
      blockText.slice(offset, block.getLength()),
    characterList: insertIntoList(
      block.getCharacterList(),
      Repeat(characterMetadata, len).toList(),
      offset,
    ),
  });

  const newOffset = offset + len;

  return contentState.merge({
    blockMap: blockMap.set(key, newBlock),
    selectionAfter: selectionState.merge({
      anchorOffset: newOffset,
      focusOffset: newOffset,
    }),
    op: getOp(true, blockMap, block, characterMetadata, text, key, offset, len),
  });
}

module.exports = insertTextIntoContentState;

function appendStyleAfterOffset(
  characterMetadata,
  ops,
  blockIndex,
  offset,
  len,
) {
  if (!characterMetadata.getStyle().isEmpty()) {
    const styleList = characterMetadata.getStyle().toList();
    for (let i = 0; i < styleList.size; i++) {
      ops.push({
        p: ['blocks', blockIndex, 'inlineStyleRanges', i],
        li: {offset: offset, length: len, style: styleList.get(i)},
      });
    }
  }
}

function getOp(
  enable,
  blockMap,
  block,
  characterMetadata,
  text,
  key,
  offset,
  len,
) {
  if (!enable) return null;
  const blockIndex = blockMap.keySeq().findIndex(k => k === key);
  const ops = [
    {
      p: ['blocks', blockIndex, 'text', offset],
      si: text,
    },
  ];
  const blockCharacterList = block.getCharacterList();
  if (offset === blockCharacterList.count()) {
    // 句末插入
    if (!characterMetadata.isEmpty()) {
      appendStyleAfterOffset(characterMetadata, ops, blockIndex, offset, len);
      if (characterMetadata.getEntity()) {
      }
    }
  } else {
    const styleRanges = encodeInlineStyleRanges(block);
    let styleRangesIndex = 0;
    styleRanges.forEach(styleRange => {
      if (styleRange.offset >= offset) {
        ops.push({
          p: [
            'blocks',
            blockIndex,
            'inlineStyleRanges',
            styleRangesIndex,
            'offset',
          ],
          od: styleRange.offset,
          oi: styleRange.offset + len,
        });
      } else {
        const headLength = offset - styleRange.offset;
        ops.push(
          {
            p: [
              'blocks',
              blockIndex,
              'inlineStyleRanges',
              styleRangesIndex,
              'length',
            ],
            od: styleRange.length,
            oi: headLength,
          },
          {
            p: ['blocks', blockIndex, 'inlineStyleRanges', styleRangesIndex],
            li: {
              offset: offset + len,
              length: styleRange.length - headLength,
              style: styleRange.style,
            },
          },
        );
        appendStyleAfterOffset(characterMetadata, ops, blockIndex, offset, len);
      }
      styleRangesIndex++;
    });
  }
  return ops;
}
