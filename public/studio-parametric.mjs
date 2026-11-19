import {resizePart as resizeStudioPart,mirrorPart as mirrorStudioPart,setPartParameterAxis as setStudioPartAxis,getPartParameters as getStudioPartParameters,assertLockedPartsUnchanged as assertStudioLocks,preservePhysicalScale as preserveStudioScale} from './studio-model.mjs?v=0.7.8';

// Public dimension API; the core lives with the model so AI proposals use exactly
// the same deterministic operation without circular module imports.
export function resizePart(...args){return resizeStudioPart(...args);}
export function mirrorPart(...args){return mirrorStudioPart(...args);}
export function setPartParameterAxis(...args){return setStudioPartAxis(...args);}
export function getPartParameters(...args){return getStudioPartParameters(...args);}
export function assertLockedPartsUnchanged(...args){return assertStudioLocks(...args);}
export function preservePhysicalScale(...args){return preserveStudioScale(...args);}
