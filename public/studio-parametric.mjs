import {resizePart as resizeStudioPart,setPartParameterAxis as setStudioPartAxis,getPartParameters as getStudioPartParameters,assertLockedPartsUnchanged as assertStudioLocks,preservePhysicalScale as preserveStudioScale} from './studio-model.mjs';

// Public dimension API; the core lives with the model so AI proposals use exactly
// the same deterministic operation without circular module imports.
export function resizePart(...args){return resizeStudioPart(...args);}
export function setPartParameterAxis(...args){return setStudioPartAxis(...args);}
export function getPartParameters(...args){return getStudioPartParameters(...args);}
export function assertLockedPartsUnchanged(...args){return assertStudioLocks(...args);}
export function preservePhysicalScale(...args){return preserveStudioScale(...args);}
