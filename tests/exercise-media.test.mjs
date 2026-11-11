import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exerciseImageBytes,imageDataUrl,jpegDimensions,exerciseMediaFields,exerciseVideoUrl,validExerciseImagePath} from '../src/exerciseMedia.ts';
import {entryFromExercise,trainingDraft,validateTraining,cloneTrainingPlan} from '../src/trainingPlans.ts';
import {trainingPrintHtml} from '../src/trainingDocument.ts';
import {createTrainingPdf} from '../src/trainingPdf.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,path=`${id(2)}/${id(900)}.jpg`;
const image=imageDataUrl(readFileSync(new URL('../assets/club-crest.jpg',import.meta.url)));
test('image references and JPEG payloads are bounded; metadata cannot contain remote images or base64 files',()=>{
 assert.equal(validExerciseImagePath(path),true);assert.equal(validExerciseImagePath('demo:'+id(900)),true);
 for(const value of ['https://example.invalid/image.jpg','../file.jpg',image,'x/'+id(1)+'.jpg',null])assert.equal(validExerciseImagePath(value),false);
 assert.deepEqual(exerciseMediaFields({}),{});assert.deepEqual(exerciseMediaFields({imagePath:null,videoUrl:''}),{imagePath:null,videoUrl:null});
 assert.deepEqual(jpegDimensions(exerciseImageBytes(image)),{width:499,height:500});
 for(const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,aGVsbG8=',image+'A'.repeat(300000)])assert.throws(()=>exerciseImageBytes(bad));
 const large=new Uint8Array(204801);large[0]=255;large[1]=216;assert.throws(()=>jpegDimensions(large),/200 KB/);
});
test('video links are normalized HTTPS YouTube/Vimeo links with no credentials, remote embeds or script URLs',()=>{
 assert.equal(exerciseVideoUrl(' https://youtu.be/demo?t=10 '),'https://youtu.be/demo?t=10');assert.equal(exerciseVideoUrl('https://vimeo.com/123'),'https://vimeo.com/123');
 for(const url of ['javascript:alert(1)','http://youtu.be/demo','https://youtu.be.evil.invalid/demo','https://user:password@youtu.be/demo','https://youtu.be:8080/demo','https://example.invalid/clip',{},'https://youtu.be/'+'a'.repeat(1000)])assert.throws(()=>exerciseVideoUrl(url));
});
const source={id:id(100),createdBy:id(2),revision:1,archivedAt:null,title:'Rondo con esquema',description:'Pase y control',categories:['Posesión'],duration:12,minPlayers:6,maxPlayers:12,spaceLength:15,spaceWidth:20,materials:[],imagePath:path,videoUrl:'https://youtu.be/demo'};
const original={id:id(500),teamId:id(10),createdBy:id(2),revision:1,archivedAt:null,title:'Sesión con imagen',date:'2026-11-11',playerCount:8,notes:'',entries:[entryFromExercise(source,id(1000))]};
test('training snapshots, validation and independent copies keep immutable media references',()=>{
 assert.equal(validateTraining(trainingDraft(original)).entries[0].imagePath,path);
 const copy=cloneTrainingPlan(original,{id:id(501),sourceId:original.id,sourceRevision:1,date:'2026-11-12',title:'Copia'},id(3),()=>id(1001));assert.equal(copy.entries[0].imagePath,path);assert.equal(copy.entries[0].videoUrl,source.videoUrl);
 source.imagePath=`${id(2)}/${id(901)}.jpg`;source.videoUrl='https://vimeo.com/other';assert.equal(original.entries[0].imagePath,path);assert.equal(original.entries[0].videoUrl,'https://youtu.be/demo');
});
test('PDF and print embed bounded images and clickable video links; missing images cannot be silently omitted',()=>{
 const images={[path]:image},fonts={font:readFileSync(new URL('../assets/fonts/DejaVuSans.ttf',import.meta.url)).toString('base64'),boldFont:readFileSync(new URL('../assets/fonts/DejaVuSans-Bold.ttf',import.meta.url)).toString('base64'),crest:image};
 const html=trainingPrintHtml(original,'Equipo',image,images);assert.ok(html.includes('class="exercise-image"'));assert.ok(html.includes('href="https://youtu.be/demo"'));assert.equal(html.includes('supabase.co'),false);
 assert.throws(()=>trainingPrintHtml(original,'Equipo',image),/Falta cargar/);assert.throws(()=>trainingPrintHtml(original,'Equipo',image,{[path]:'javascript:alert(1)'}));
 const pdf=createTrainingPdf(original,'Equipo',{...fonts,images}),output=pdf.output();assert.ok(output.startsWith('%PDF-'));assert.ok(output.includes('/URI (https://youtu.be/demo)'));assert.throws(()=>createTrainingPdf(original,'Equipo',fonts),/Falta cargar/);
});
