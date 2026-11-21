const test=require('node:test');
const assert=require('node:assert/strict');
const {imageDimensions,prepareWallpaper}=require('../public/wallpaper-store.js');
function png(w,h){
 const p=Buffer.alloc(24);p[0]=0x89;p.write('PNG\r\n\x1a\n',1,'ascii');p.writeUInt32BE(13,8);p.write('IHDR',12);p.writeUInt32BE(w,16);p.writeUInt32BE(h,20);return p;
}
function webp(chunk){const p=Buffer.alloc(30);p.write('RIFF');p.write('WEBP',8);p.write(chunk,12);p.writeUInt32LE(10,16);return p;}
test('recognizes PNG, JPEG and WebP dimensions based on content rather than filename',()=>{
 assert.deepEqual(imageDimensions(png(800,450)),{width:800,height:450});
 assert.deepEqual(imageDimensions(Buffer.from('ffd8ffc200080801c2032001','hex')),{width:800,height:450});
 const extended=webp('VP8X');extended.writeUIntLE(799,24,3);extended.writeUIntLE(449,27,3);
 assert.deepEqual(imageDimensions(extended),{width:800,height:450});
 const lossy=webp('VP8 ');lossy.set([0x9d,1,0x2a],23);lossy.writeUInt16LE(800,26);lossy.writeUInt16LE(450,28);
 assert.deepEqual(imageDimensions(lossy),{width:800,height:450});
 const lossless=webp('VP8L');lossless[20]=0x2f;lossless.writeUInt32LE(799+(449<<14),21);
 assert.deepEqual(imageDimensions(lossless),{width:800,height:450});
});
test('rejects oversized or unsupported image data before asking the browser to decode',async()=>{
 assert.throws(()=>imageDimensions(png(8000,7000)),/28 мегапикселей/);
 assert.throws(()=>imageDimensions(png(12001,1)),/12 000/);
 assert.throws(()=>imageDimensions(Buffer.from('<svg onload="alert(1)"/>')),/JPG, PNG или WebP/);
 assert.throws(()=>imageDimensions(Buffer.from([0xff,0xd8,0xff,0xff,0xff,0xff])),/корректное/);
 await assert.rejects(prepareWallpaper({size:17*1024*1024}),/16 МБ/);
});
