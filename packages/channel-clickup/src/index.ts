/**
 * ClickUp Chat channel plugin — entry point.
 * Discovered by the omni channel loader via the default export.
 */

import { ClickUpPlugin } from './plugin';

export { ClickUpPlugin } from './plugin';
export * from './types';

const plugin = new ClickUpPlugin();
export default plugin;
