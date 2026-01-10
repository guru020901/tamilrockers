import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';

console.log("--- FFmpeg Diagnostic ---");
console.log("1. ffmpeg-static path:", ffmpegStatic);

if (!ffmpegStatic) {
    console.error("CRITICAL: ffmpeg-static path is null/undefined!");
    process.exit(1);
}

if (fs.existsSync(ffmpegStatic)) {
    console.log("2. Binary exists on disk: YES");
} else {
    console.error("2. Binary exists on disk: NO");
}

ffmpeg.setFfmpegPath(ffmpegStatic);

ffmpeg().getAvailableCodecs((err, codecs) => {
    if (err) {
        console.error("3. FFmpeg Execution Failed:", err.message);
    } else {
        console.log("3. FFmpeg Execution Success");
        console.log("   H.264 Support:", codecs['libx264'] ? 'YES' : 'NO');
        console.log("   AAC Support:", codecs['aac'] ? 'YES' : 'NO');
    }
});
