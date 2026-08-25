/**
 * The file tree's horizontal geometry, taken from the git tab's repo tree so
 * the two read as one list at two depths of the same panel.
 *
 * The file tree used to run tighter — 8px of gutter, 8px per level, icons held
 * apart by their own margins — and beside the git tab it read as a denser,
 * smaller list rather than as the same tree showing different things. These
 * two numbers are the git tree's (`TREE_INDENT_PX` in GitStatusPanel and its
 * rows' `paddingLeft: 12 + depth * 12`), named once here because the rows and
 * the block rules must agree: a rule inset on one gutter and a row indented on
 * another shows as a tree whose lines miss its names.
 */

/** Gutter before the first level's chevron. */
export const TREE_ROW_PAD_PX = 12

/** Added per level of depth. */
export const TREE_INDENT_PX = 12
