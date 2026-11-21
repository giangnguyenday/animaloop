import { createOplaTimeline, maxOplaRecordingSeconds } from './opla-timeline.js';
import { exportOplaAnimation } from './opla-animation-export.js?v=timeline-tools-final';
import { download } from './image-export.js';
import { fadeOplaFrame, timelineFadeOpacity } from './opla-timeline-effects.js?v=timeline-tools-final';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timecode = (seconds) => {
  const ticks = Math.max(0, Math.round(seconds * 100));
  return `${String(Math.floor(ticks / 6000)).padStart(2, '0')}:${String(Math.floor(ticks / 100) % 60).padStart(2, '0')}.${String(ticks % 100).padStart(2, '0')}`;
};

export function bindOplaRecording({ captureFrame, onRecordStart, onPreviewChange, notify }) {
  const $ = (id) => document.getElementById(id);
  const image = $('timeline-preview');
  const fadeOverlay = $('timeline-fade-overlay');
  const visibilityKey = 'animaloop-opla-timeline-open';
  let timeline = createOplaTimeline();
  let timelineOpen = true;
  try { timelineOpen = localStorage.getItem(visibilityKey) !== 'false'; } catch { /* Use the default view. */ }
  let previewing = false;
  let previewPlaying = false;
  let position = 0;
  let trimIn = 0;
  let trimOut = 0;
  let cropping = false;
  let cropStart = 0;
  let cropEnd = 0;
  let positionBeforeCrop = 0;
  let fadeIn = 0;
  let fadeOut = 0;
  let fadePanel = '';
  let previewStart = 0;
  let lastPreviewFrame;
  let lastUiTime = 0;
  let recordingTimer;
  let exportJob;
  const previewUrls = new Map();
  const exportButtons = ['export-mov', 'export-gif'];

  function setTimelineOpen(open, remember = true) {
    timelineOpen = open;
    if (!open) leavePreview();
    if (remember) {
      try { localStorage.setItem(visibilityKey, String(open)); } catch { /* The toggle still works. */ }
    }
    refresh();
  }

  function labelButton(id, label) {
    $(id).setAttribute('aria-label', label);
    $(id).title = label;
  }

  function releasePreviewUrls() {
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    previewUrls.clear();
    lastPreviewFrame = undefined;
  }

  function refresh() {
    const status = timeline.status;
    const ready = status.frameCount > 0 && !status.recording;
    const busy = !!exportJob;
    const canExport = ready && trimOut > trimIn && !busy && !cropping;
    const limit = clamp(Number($('record-duration').value) || maxOplaRecordingSeconds, 1, maxOplaRecordingSeconds);
    const clipDuration = trimOut - trimIn;
    const total = status.recording ? limit : clipDuration || limit;
    $('opla-timeline').hidden = !timelineOpen;
    document.body.dataset.timelineOpen = String(timelineOpen);
    const toggle = $('timeline-toggle');
    toggle.setAttribute('aria-expanded', String(timelineOpen));
    toggle.dataset.recording = String(status.recording);
    toggle.disabled = busy;
    labelButton('timeline-toggle', `${timelineOpen ? 'Hide' : 'Show'} timeline${status.recording ? ' (recording)' : ''}`);
    $('timeline-record').disabled = status.recording || busy || cropping;
    labelButton('timeline-record', ready ? 'Record again' : 'Record');
    $('timeline-record').setAttribute('aria-pressed', String(status.recording));
    $('timeline-stop').disabled = !status.recording;
    $('timeline-stop').hidden = !status.recording;
    $('record-duration').disabled = status.recording || busy || cropping;
    $('timeline-play').disabled = !ready || busy || cropping;
    $('timeline-play').hidden = !ready;
    labelButton('timeline-play', previewPlaying ? 'Pause preview' : 'Preview');
    $('timeline-play').dataset.playing = String(previewPlaying);
    $('timeline-play').setAttribute('aria-pressed', String(previewPlaying));
    $('timeline-live').hidden = !ready || !previewing;
    $('timeline-live').disabled = busy;
    $('timeline-clear').disabled = !ready || busy;
    $('timeline-clear').hidden = !ready;
    const complete = ready && ['duration', 'stopped'].includes(status.stopReason);
    $('timeline-completion').hidden = !ready;
    $('timeline-completion').textContent = complete ? 'Recording complete' : 'Recording stopped';
    for (const id of exportButtons) $(id).disabled = !canExport;
    const scrub = $('timeline-scrub');
    scrub.disabled = !ready || busy || cropping;
    scrub.max = total;
    const cursor = status.recording ? status.duration : Math.max(0, position - trimIn);
    scrub.value = cursor;
    scrub.setAttribute('aria-valuetext', timecode(cursor));
    $('opla-timeline').dataset.cropping = String(cropping);
    $('timeline-crop').disabled = !ready || busy;
    $('timeline-crop').hidden = !ready;
    $('timeline-crop').setAttribute('aria-pressed', String(cropping));
    for (const [id, value] of [['timeline-crop-start', cropStart], ['timeline-crop-end', cropEnd]]) {
      $(id).disabled = !cropping || busy;
      $(id).max = status.duration;
      $(id).value = value;
      $(id).setAttribute('aria-valuetext', timecode(value));
    }
    for (const id of ['timeline-crop-apply', 'timeline-crop-cancel']) $(id).hidden = !cropping;
    $('timeline-crop-range').style.setProperty('--crop-start', `${status.duration ? cropStart / status.duration * 100 : 0}%`);
    $('timeline-crop-range').style.setProperty('--crop-end', `${status.duration ? cropEnd / status.duration * 100 : 100}%`);
    $('timeline-time').textContent = cropping ? `${timecode(cropStart)} – ${timecode(cropEnd)}` : `${timecode(cursor)} / ${timecode(total)}`;
    for (const [edge, value] of [['in', fadeIn], ['out', fadeOut]]) {
      const id = `timeline-fade-${edge}`;
      $(id).disabled = !ready || busy || cropping;
      $(id).closest('.timeline-tool').hidden = !ready;
      $(id).setAttribute('aria-pressed', String(value > 0));
      $(id).setAttribute('aria-expanded', String(fadePanel === edge));
      labelButton(id, `Fade ${edge}${value ? ` (${+value.toFixed(2)} s)` : ''}`);
      $(`${id}-panel`).hidden = fadePanel !== edge;
      const input = $(`${id}-duration`);
      input.max = Math.max(0, clipDuration / 2);
      if (document.activeElement !== input) input.value = +value.toFixed(3);
    }
    const message = status.recording ? 'Recording.'
      : ready ? `${complete ? 'Recording complete' : 'Recording stopped'}. ${status.duration.toFixed(2)} seconds recorded.` : '';
    if ($('timeline-state').textContent !== message) $('timeline-state').textContent = message;
    $('timeline-progress').hidden = !busy;
    $('timeline-cancel').hidden = !busy;
    $('timeline-cancel').disabled = busy && exportJob.signal.aborted;
  }

  function showFrame() {
    const frame = timeline.frameAt(position);
    fadeOverlay.hidden = !previewing || cropping || (!fadeIn && !fadeOut);
    fadeOverlay.style.opacity = String(cropping ? 0 : timelineFadeOpacity(position - trimIn, trimOut - trimIn, fadeIn, fadeOut));
    if (!frame || frame === lastPreviewFrame) return;
    let url = previewUrls.get(frame.svg);
    if (!url) {
      url = URL.createObjectURL(frame.svg);
      previewUrls.set(frame.svg, url);
    }
    image.src = url;
    while (previewUrls.size > 3) {
      const [oldFrame, oldUrl] = previewUrls.entries().next().value;
      previewUrls.delete(oldFrame);
      URL.revokeObjectURL(oldUrl);
    }
    lastPreviewFrame = frame;
  }

  function enterPreview() {
    if (!timeline.status.frameCount || timeline.status.recording) return;
    if (!previewing) {
      previewing = true;
      image.hidden = false;
      onPreviewChange?.(true, timeline.status);
    }
    showFrame();
  }

  function leavePreview(resume = true) {
    if (!previewing) return;
    if (cropping) position = positionBeforeCrop;
    previewing = previewPlaying = false;
    cropping = false;
    fadePanel = '';
    fadeOverlay.hidden = true;
    image.hidden = true;
    image.removeAttribute('src');
    releasePreviewUrls();
    onPreviewChange?.(false, timeline.status, { resume });
    refresh();
  }

  function pausePreview() {
    if (!previewing) return;
    previewPlaying = false;
    refresh();
  }

  function finishRecording(status) {
    clearTimeout(recordingTimer);
    trimIn = 0;
    trimOut = position = status.duration;
    previewPlaying = false;
    if (status.frameCount) {
      enterPreview();
      if (!timelineOpen) setTimelineOpen(true, false);
    }
    refresh();
    const message = {
      duration: `Recording complete · ${status.duration.toFixed(1)} seconds.`,
      memory: 'Recording stopped at the memory limit. Export this clip or record a simpler scene.',
      size: 'Recording stopped because the artboard size changed. Your clip keeps its original size.',
      hidden: 'Recording stopped when the tab was hidden.',
      error: 'Recording stopped. The frames already captured are still available.',
    }[status.stopReason] ?? `Recording complete · ${status.duration.toFixed(1)} seconds.`;
    notify?.(message);
  }

  function stopRecording(reason = 'stopped') {
    if (!timeline.status.recording) return;
    finishRecording(timeline.stop(performance.now(), reason));
  }

  function startRecording() {
    if (timeline.status.recording || exportJob) return;
    leavePreview(false);
    releasePreviewUrls();
    onRecordStart?.();
    const requested = Number($('record-duration').value);
    const duration = Number.isFinite(requested) ? clamp(requested, 1, maxOplaRecordingSeconds) : maxOplaRecordingSeconds;
    $('record-duration').value = duration;
    try {
      const initial = captureFrame();
      timeline = createOplaTimeline({ maxDuration: duration });
      const now = performance.now();
      timeline.start(now, initial);
      const sampled = timeline.sample(now, () => initial);
      if (!sampled.recording) { finishRecording(sampled); return; }
      trimIn = trimOut = position = 0;
      cropping = false;
      fadeIn = fadeOut = 0;
      fadePanel = '';
      $('timeline-export-status').textContent = '';
      recordingTimer = setTimeout(() => stopRecording('duration'), duration * 1000);
      refresh();
    } catch (error) {
      if (timeline.status.recording) finishRecording(timeline.stop(performance.now(), 'error'));
      notify?.(error.message ?? 'Recording could not start.');
    }
  }

  function tick(now) {
    if (timeline.status.recording) {
      try {
        const status = timeline.sample(now, captureFrame);
        if (!status.recording) finishRecording(status);
        else if (now - lastUiTime >= 50) { lastUiTime = now; refresh(); }
      } catch (error) {
        finishRecording(timeline.status);
        notify?.(error.message ?? 'Recording stopped.');
      }
    }
    if (previewPlaying) {
      position = trimIn + ((now - previewStart) / 1000 % (trimOut - trimIn));
      showFrame();
      if (now - lastUiTime >= 50) { lastUiTime = now; refresh(); }
    }
  }

  function startCrop() {
    if (timeline.status.recording || !timeline.status.frameCount || exportJob) return;
    if (cropping) { cancelCrop(); return; }
    previewPlaying = false;
    fadePanel = '';
    cropStart = trimIn;
    cropEnd = trimOut;
    positionBeforeCrop = position;
    cropping = true;
    enterPreview();
    refresh();
  }

  function changeCrop(edge, value) {
    if (!cropping || !Number.isFinite(value)) return;
    const gap = Math.min(.05, timeline.status.duration);
    if (edge === 'start') cropStart = clamp(value, 0, cropEnd - gap);
    else cropEnd = clamp(value, cropStart + gap, timeline.status.duration);
    position = edge === 'start' ? cropStart : cropEnd;
    showFrame();
    refresh();
  }

  function cancelCrop() {
    cropping = false;
    position = positionBeforeCrop;
    showFrame();
    refresh();
    $('timeline-crop').focus({ preventScroll: true });
  }

  function applyCrop() {
    if (!cropping) return;
    trimIn = cropStart;
    trimOut = cropEnd;
    cropping = false;
    position = clamp(position, trimIn, trimOut);
    fadeIn = Math.min(fadeIn, (trimOut - trimIn) / 2);
    fadeOut = Math.min(fadeOut, (trimOut - trimIn) / 2);
    showFrame();
    $('timeline-export-status').textContent = `Clip cropped · ${(trimOut - trimIn).toFixed(2)} s`;
    refresh();
    $('timeline-crop').focus({ preventScroll: true });
  }

  function setFade(edge, value) {
    if (!Number.isFinite(value)) return;
    const duration = clamp(value, 0, (trimOut - trimIn) / 2);
    if (edge === 'in') fadeIn = duration;
    else fadeOut = duration;
    if (previewing) showFrame();
    refresh();
  }

  async function exportAnimation(format) {
    const status = timeline.status;
    if (!status.frameCount || status.recording || exportJob || cropping || trimOut <= trimIn) return;
    previewPlaying = false;
    if (!timelineOpen) setTimelineOpen(true, false);
    const controller = new AbortController();
    exportJob = controller;
    const source = timeline;
    const start = trimIn;
    const duration = trimOut - start;
    const exportFadeIn = fadeIn;
    const exportFadeOut = fadeOut;
    fadePanel = '';
    $('timeline-progress').value = 0;
    $('timeline-export-status').textContent = `Preparing ${format.toUpperCase()}…`;
    refresh();
    try {
      const blob = await exportOplaAnimation({
        format, width: status.width, height: status.height, duration, signal: controller.signal,
        renderFrame: (seconds, sample) => fadeOplaFrame(source.frameAt(start + seconds).svg, {
          seconds: exportFadeOut && sample?.index === sample?.frameCount - 1 ? duration : seconds,
          duration, fadeIn: exportFadeIn, fadeOut: exportFadeOut, width: status.width, height: status.height,
        }),
        onProgress(progress) {
          $('timeline-progress').value = progress;
          $('timeline-export-status').textContent = `Exporting ${format.toUpperCase()} · ${Math.round(progress * 100)}%`;
        },
      });
      if (controller.signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
      download(blob, `animaloop-opla.${format}`);
      $('timeline-export-status').textContent = `${format.toUpperCase()} exported · ${duration.toFixed(2)} s`;
      notify?.(`${format.toUpperCase()} exported.`);
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Export cancelled.' : error.message ?? 'Animation export failed.';
      $('timeline-export-status').textContent = message;
      notify?.(message);
    } finally {
      exportJob = undefined;
      refresh();
    }
  }

  $('timeline-record').addEventListener('click', startRecording);
  $('timeline-toggle').addEventListener('click', () => setTimelineOpen(!timelineOpen));
  $('timeline-stop').addEventListener('click', () => stopRecording());
  $('timeline-play').addEventListener('click', () => {
    if (previewPlaying) previewPlaying = false;
    else {
      if (position < trimIn || position >= trimOut) position = trimIn;
      enterPreview();
      previewPlaying = true;
      previewStart = performance.now() - (position - trimIn) * 1000;
    }
    refresh();
  });
  $('timeline-live').addEventListener('click', () => leavePreview());
  $('timeline-clear').addEventListener('click', () => {
    if (exportJob || timeline.status.recording) return;
    leavePreview();
    releasePreviewUrls();
    timeline.clear();
    trimIn = trimOut = position = 0;
    cropping = false;
    fadeIn = fadeOut = 0;
    fadePanel = '';
    $('timeline-export-status').textContent = '';
    refresh();
  });
  $('timeline-scrub').addEventListener('input', (event) => {
    if (timeline.status.recording || exportJob) return;
    previewPlaying = false;
    position = trimIn + clamp(event.target.valueAsNumber, 0, trimOut - trimIn);
    enterPreview();
    refresh();
  });
  $('timeline-crop').addEventListener('click', startCrop);
  $('timeline-crop-apply').addEventListener('click', applyCrop);
  $('timeline-crop-cancel').addEventListener('click', cancelCrop);
  for (const edge of ['start', 'end']) {
    $(`timeline-crop-${edge}`).addEventListener('input', (event) => changeCrop(edge, event.target.valueAsNumber));
  }
  for (const edge of ['in', 'out']) {
    const id = `timeline-fade-${edge}`;
    $(id).addEventListener('click', () => {
      if (fadePanel === edge) fadePanel = '';
      else {
        const value = edge === 'in' ? fadeIn : fadeOut;
        if (!value) setFade(edge, Math.min(.5, (trimOut - trimIn) / 2));
        fadePanel = edge;
        enterPreview();
      }
      refresh();
    });
    const input = $(`${id}-duration`);
    input.addEventListener('input', () => setFade(edge, input.valueAsNumber));
    input.addEventListener('change', () => setFade(edge, input.valueAsNumber));
    input.addEventListener('blur', () => { input.value = +(edge === 'in' ? fadeIn : fadeOut).toFixed(3); });
    $(`${id}-remove`).addEventListener('click', () => {
      fadePanel = '';
      setFade(edge, 0);
      $(id).focus({ preventScroll: true });
    });
  }
  $('record-duration').addEventListener('change', refresh);
  for (const [id, format] of [['export-mov', 'mov'], ['export-gif', 'gif']]) {
    $(id).addEventListener('click', (event) => {
      const menu = event.currentTarget.closest('details');
      if (menu) menu.open = false;
      exportAnimation(format);
    });
  }
  $('timeline-cancel').addEventListener('click', () => { exportJob?.abort(); refresh(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopRecording('hidden'); });
  document.addEventListener('click', (event) => {
    if (!fadePanel) return;
    const id = `timeline-fade-${fadePanel}`;
    if ($(id).contains(event.target) || $(`${id}-panel`).contains(event.target)) return;
    fadePanel = '';
    refresh();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && (fadePanel || cropping)) {
      event.preventDefault();
      if (fadePanel) {
        const id = `timeline-fade-${fadePanel}`;
        fadePanel = '';
        refresh();
        $(id).focus({ preventScroll: true });
      }
      else cancelCrop();
      return;
    }
    if (event.key === 'Escape' && previewing && !exportJob && !event.defaultPrevented) {
      event.preventDefault();
      leavePreview();
    }
  });
  window.addEventListener('pagehide', () => {
    clearTimeout(recordingTimer);
    exportJob?.abort();
    if (timeline.status.recording) timeline.stop(performance.now());
    releasePreviewUrls();
  });
  refresh();
  return {
    tick, leavePreview, pausePreview, stopRecording,
    async snapshotPreview() {
      if (!previewing) return undefined;
      const frame = timeline.frameAt(position);
      if (!frame) return undefined;
      return { ...frame, svg: await fadeOplaFrame(frame.svg, {
        seconds: position - trimIn, duration: trimOut - trimIn,
        fadeIn: cropping ? 0 : fadeIn, fadeOut: cropping ? 0 : fadeOut,
        width: frame.width, height: frame.height,
      }) };
    },
    get previewing() { return previewing; },
    get currentFrame() { return previewing ? timeline.frameAt(position) : undefined; },
  };
}
