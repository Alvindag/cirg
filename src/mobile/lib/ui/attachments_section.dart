import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../services/voice_config.dart';

import '../data/database.dart';
import '../providers.dart';
import 'signature_pad.dart';

/// Camera, voice note and signature capture for one visit. Everything is saved on the device first and uploaded by sync.
class AttachmentsSection extends ConsumerStatefulWidget {
  const AttachmentsSection({super.key, required this.visitId, required this.enabled, this.signerName});
  final String visitId;
  final bool enabled;
  final String? signerName;

  @override
  ConsumerState<AttachmentsSection> createState() => _AttachmentsSectionState();
}

class _AttachmentsSectionState extends ConsumerState<AttachmentsSection> {
  static const _maxRecording = Duration(minutes: 10);
  final _recorder = AudioRecorder();
  final _player = AudioPlayer();
  Timer? _ticker;
  Duration _elapsed = Duration.zero;
  bool _recording = false;
  bool _starting = false;
  String? _playingId;

  @override
  void initState() {
    super.initState();
    _player.onPlayerComplete.listen((_) => mounted ? setState(() => _playingId = null) : null);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _recorder.dispose();
    _player.dispose();
    super.dispose();
  }

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _photo() async {
    try {
      // Resized and re-encoded as JPEG: small enough for slow mobile networks, and drops most EXIF metadata.
      final shot = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 80, maxWidth: 1600, maxHeight: 1600);
      if (shot == null) return;
      await ref.read(attachmentServiceProvider).addPhoto(widget.visitId, shot.path);
    } catch (e) {
      if (mounted) _toast('Could not take the photo: $e');
    }
  }

  Future<void> _toggleRecording() async {
    if (_recording) return _stopRecording();
    try {
      if (!await _recorder.hasPermission()) return _toast('Microphone permission is needed to record a voice note.');
      final dir = await getTemporaryDirectory();
      setState(() => _starting = true);
      await Future<void>.delayed(voiceNoteStartDelay);
      await _recorder.start(
        voiceNoteConfig,
        path: p.join(dir.path, 'note_${DateTime.now().millisecondsSinceEpoch}.m4a'),
      );
      if (mounted) setState(() { _starting = false; _recording = true; _elapsed = Duration.zero; });
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => _elapsed += const Duration(seconds: 1));
        if (_elapsed >= _maxRecording) _stopRecording();
      });
    } catch (e) {
      if (mounted) setState(() => _starting = false);
      if (mounted) _toast('Could not start recording: $e');
    }
  }

  Future<void> _stopRecording() async {
    _ticker?.cancel();
    final duration = _elapsed;
    final path = await _recorder.stop();
    if (mounted) setState(() => _recording = false);
    if (path == null) return;
    try {
      await ref.read(attachmentServiceProvider).addVoiceNote(widget.visitId, path, durationMs: duration.inMilliseconds);
    } catch (e) {
      if (mounted) _toast('Could not save the voice note: $e');
    }
  }

  Future<void> _signature() async {
    final r = await showSignatureDialog(context, suggestedName: widget.signerName);
    if (r == null) return;
    await ref.read(attachmentServiceProvider).addSignature(widget.visitId, r.png, signerName: r.signerName, meaning: r.meaning);
  }

  Future<void> _play(Attachment a) async {
    if (_playingId == a.id) {
      await _player.stop();
      return setState(() => _playingId = null);
    }
    await _player.play(DeviceFileSource(a.localPath));
    setState(() => _playingId = a.id);
  }

  @override
  Widget build(BuildContext context) {
    final db = ref.watch(databaseProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Photos, voice notes and signature', style: TextStyle(fontWeight: FontWeight.w600)),
      const SizedBox(height: 8),
      if (widget.enabled)
        Wrap(spacing: 8, runSpacing: 8, children: [
          OutlinedButton.icon(onPressed: _recording ? null : _photo, icon: const Icon(Icons.photo_camera), label: const Text('Photo')),
          OutlinedButton.icon(
            onPressed: _starting ? null : _toggleRecording,
            icon: Icon(_recording ? Icons.stop_circle : Icons.mic, color: _recording ? Colors.red : null),
            label: Text(_recording ? 'Stop ${_fmt(_elapsed)}' : _starting ? 'Get ready…' : 'Voice note'),
          ),
          OutlinedButton.icon(onPressed: _recording ? null : _signature, icon: const Icon(Icons.draw), label: const Text('Signature')),
        ]),
      StreamBuilder<List<Attachment>>(
        stream: db.watchAttachments(widget.visitId),
        builder: (context, snap) {
          final items = snap.data ?? const <Attachment>[];
          return Column(children: [for (final a in items) _tile(a)]);
        },
      ),
    ]);
  }

  Widget _tile(Attachment a) {
    final hasFile = a.localPath.isNotEmpty && File(a.localPath).existsSync();
    final leading = switch (a.kind) {
      'VoiceNote' => IconButton(icon: Icon(_playingId == a.id ? Icons.stop : Icons.play_arrow), onPressed: hasFile ? () => _play(a) : null),
      _ when hasFile => GestureDetector(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _FullImage(path: a.localPath))),
          child: Image.file(File(a.localPath), width: 48, height: 48, fit: a.kind == 'Signature' ? BoxFit.contain : BoxFit.cover),
        ),
      _ => const Icon(Icons.image_not_supported),
    };
    final title = switch (a.kind) {
      'Photo' => 'Photo',
      'VoiceNote' => 'Voice note${a.durationMs == null ? '' : ' (${_fmt(Duration(milliseconds: a.durationMs!))})'}',
      _ => 'Signature: ${a.signerName ?? ''}',
    };
    final status = switch (a.uploadStatus) {
      'uploaded' => 'Uploaded',
      'failed' => 'Upload failed: ${a.uploadError ?? ''}',
      _ => 'Waiting to upload',
    };
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: SizedBox(width: 48, height: 48, child: Center(child: leading)),
      title: Text(title),
      subtitle: Text('${(a.sizeBytes / 1024).ceil()} KB · $status${a.meaning == null ? '' : ' · ${a.meaning}'}'),
      trailing: a.uploadStatus == 'uploaded' || !widget.enabled && a.kind == 'Signature'
          ? null
          : IconButton(
              tooltip: 'Remove',
              icon: const Icon(Icons.delete_outline),
              onPressed: () => ref.read(attachmentServiceProvider).deletePending(a.id),
            ),
    );
  }

  static String _fmt(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
}

class _FullImage extends StatelessWidget {
  const _FullImage({required this.path});
  final String path;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        backgroundColor: Colors.black,
        body: Center(child: InteractiveViewer(child: Image.file(File(path)))),
      );
}
