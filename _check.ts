import { pickFields } from './src/helpers/schema';
import { parsePagination } from './src/helpers/pagination';
import { parseDimension } from './src/pictures/pictures';
import { buildPrompt, buildSceneWithCharacter } from './src/tti/prompt';

const evil = { name: 'x', systemMessage: 'y', published: true, recommended: true, free: true, userId: 'victim' };
console.log('scenario POST whitelist:', pickFields(evil, ['name','systemMessage','type','greeting','temperature','topP','frequencyPenalty','presencePenalty','dollarPerMessage','nsfw','userGender','avatarGender','recommended']));

console.log('pagination junk:', parsePagination('abc','xyz'), parsePagination('2','20'));
console.log('dimension junk:', parseDimension('abc'), parseDimension('99999'), parseDimension('-5'), parseDimension('64'));

console.log('prompt $ injection:', buildPrompt('portrait of {subject}, glow', "a woman $' HACKED"));
console.log('scene w/ char:', buildSceneWithCharacter('a lighthouse', 'a woman with {scene} tattoo'));
