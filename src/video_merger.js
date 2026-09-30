/**
 * Ultra-Fast Video Merger Module using FFmpeg Concat Demuxer.
 * Automatically concatenates multi-episode drama videos into a continuous full video.
 * Supports:
 * - Lossless Stream Copy (-c copy, ~2-5s for 100 episodes)
 * - Ultra-fast re-encode fallback if stream headers vary
 * - Modes:
 *   - 'merged': Concatenates all episodes and removes separate episode files
 *   - 'both': Keeps both individual episodes and the full merged video
 *   - 'separate': Leaves individual episodes as-is
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

function sanitizeFilename(name) {
  return String(name || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim();
}

/**
 * Finds all video files (.mp4) in a drama folder and sorts them numerically by episode index.
 */
function getEpisodeFiles(dramaDir) {
  if (!fs.existsSync(dramaDir)) return [];
  return fs.readdirSync(dramaDir)
    .filter(f => {
      if (f.includes('Full') || f.includes('វីដេអូពេញ') || f.endsWith('.tmp.mp4') || f.endsWith('.tmp')) return false;
      return /\.mp4$/i.test(f);
    })
    .sort((a, b) => {
      const matchA = a.match(/(?:EP?|E|\b)(\d+)\b/i);
      const matchB = b.match(/(?:EP?|E|\b)(\d+)\b/i);
      const na = matchA ? parseInt(matchA[1], 10) : 0;
      const nb = matchB ? parseInt(matchB[1], 10) : 0;
      return na - nb;
    });
}

function findFfmpeg() {
  const candidates = [
    'ffmpeg',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffmpeg.exe')
  ];
  for (const p of candidates) {
    if (p !== 'ffmpeg' && fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

/**
 * Merges episode files into a single continuous full video.
 * @param {Object} options
 * @param {string} options.dramaDir - Directory containing episode files
 * @param {string} options.seriesTitle - Drama title for naming
 * @param {string} options.mode - 'merged' (delete episodes) | 'both' (keep both)
 * @param {function} [options.onLog] - Logging callback
 * @returns {Promise<{ ok: boolean, outputFile?: string, count?: number, error?: string }>}
 */
async function mergeDramaEpisodes({ dramaDir, seriesTitle, mode = 'both', onLog = console.log }) {
  return new Promise((resolve) => {
    try {
      if (mode === 'separate') {
        return resolve({ ok: true, skipped: true, mode: 'separate' });
      }

      const files = getEpisodeFiles(dramaDir);
      if (files.length <= 1) {
        onLog(`[VideoMerger] Only ${files.length} episode found in "${dramaDir}". Skipping merge.`);
        return resolve({ ok: true, skipped: true, count: files.length });
      }

      const safeTitle = sanitizeFilename(seriesTitle) || 'Full_Drama';
      const outputName = `${safeTitle}_វីដេអូពេញ_Full_${files.length}ភាគ.mp4`;
      const outputFile = path.join(dramaDir, outputName);
      const listFile = path.join(dramaDir, `concat_list_${Date.now()}.txt`);

      // Write FFmpeg concat list with absolute forward-slash paths
      const listContent = files.map(f => {
        const fullPath = path.resolve(dramaDir, f).replace(/\\/g, '/');
        return `file '${fullPath.replace(/'/g, "'\\''")}'`;
      }).join('\n');
      fs.writeFileSync(listFile, listContent, 'utf-8');

      const ffmpegBin = findFfmpeg();
      onLog(`[VideoMerger] 🎬 Starting ultra-fast concatenation of ${files.length} episodes into "${outputName}"...`);

      // 1. Primary Attempt: Stream Copy (-c copy) - takes ~2-5s, 100% loss-free original quality
      const cmdCopy = `"${ffmpegBin}" -y -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}"`;
      exec(cmdCopy, { timeout: 300000, cwd: dramaDir }, (err) => {
        if (!err && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 1024 * 1024) {
          try { fs.unlinkSync(listFile); } catch (e) {}

          if (mode === 'merged') {
            onLog(`[VideoMerger] 🧹 Cleaning up separate episode files (Mode: Merged Only)...`);
            for (const f of files) {
              try { fs.unlinkSync(path.join(dramaDir, f)); } catch (e) {}
            }
          }

          onLog(`[VideoMerger] 🎉 Successfully created full merged video: "${outputName}"!`);
          return resolve({ ok: true, outputFile, count: files.length });
        }

        // 2. Secondary Attempt: Fast Re-encode fallback if streams differ
        onLog(`[VideoMerger] Stream copy experienced variance, switching to fast fallback re-encode...`);
        const cmdFast = `"${ffmpegBin}" -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset ultrafast -crf 22 -c:a aac "${outputFile}"`;
        exec(cmdFast, { timeout: 600000, cwd: dramaDir }, (errFast) => {
          try { fs.unlinkSync(listFile); } catch (e) {}

          if (!errFast && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 1024 * 1024) {
            if (mode === 'merged') {
              onLog(`[VideoMerger] 🧹 Cleaning up separate episode files (Mode: Merged Only)...`);
              for (const f of files) {
                try { fs.unlinkSync(path.join(dramaDir, f)); } catch (e) {}
              }
            }
            onLog(`[VideoMerger] 🎉 Successfully created full merged video (fast encoded)!`);
            return resolve({ ok: true, outputFile, count: files.length });
          }

          onLog(`[VideoMerger] ⚠️ Merge failed: ${errFast ? errFast.message : (err ? err.message : 'Unknown error')}`);
          resolve({ ok: false, error: errFast ? errFast.message : 'Merge failed' });
        });
      });
    } catch (err) {
      onLog(`[VideoMerger] ⚠️ Merge error: ${err.message}`);
      resolve({ ok: false, error: err.message });
    }
  });
}

module.exports = {
  mergeDramaEpisodes,
  getEpisodeFiles
};
