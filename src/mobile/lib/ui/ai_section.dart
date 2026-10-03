import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import '../services/ai_service.dart';

/// AI help on a visit: turn an uploaded voice note into text, and draft a summary of the visit. Online only.
/// Everything the AI produces is a draft the rep reads, edits and accepts; nothing is used automatically.
class AiAssistSection extends ConsumerStatefulWidget {
  const AiAssistSection({super.key, required this.visitId, required this.enabled, required this.saveReport, required this.onTranscript, required this.onSummary});
  final String visitId;
  final bool enabled;

  /// Saves the call report on the device (so its latest text is what gets uploaded).
  final Future<void> Function() saveReport;
  final void Function(String text) onTranscript;
  final Future<void> Function(SummaryDraft summary, List<FollowUp> followUps) onSummary;

  @override
  ConsumerState<AiAssistSection> createState() => _AiAssistSectionState();
}

class _AiAssistSectionState extends ConsumerState<AiAssistSection> {
  bool _busy = false;

  void _toast(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on AiException catch (e) {
      _toast(e.message);
    } catch (_) {
      _toast('Could not reach the server. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _syncedOnline() async {
    final coordinator = ref.read(syncCoordinatorProvider.notifier);
    await coordinator.syncNow();
    return ref.read(syncCoordinatorProvider).lastError == null;
  }

  Future<void> _transcribe(Attachment note) => _run(() async {
        final ai = ref.read(aiServiceProvider);
        final draft = await ai.transcribe(note.id);
        if (!mounted) return;
        final text = await showDialog<String?>(context: context, builder: (_) => _TranscriptDialog(draft: draft));
        try {
          await ai.decide(draft.id, accept: text != null, editedText: text);
        } catch (_) {
          _toast('Your decision could not be recorded yet.');
        }
        if (text != null) widget.onTranscript(text);
      });

  Future<void> _summarise() => _run(() async {
        await widget.saveReport();
        if (!await _syncedOnline()) throw AiException('Connect to the internet to use AI. Your report is saved on this device.');
        final ai = ref.read(aiServiceProvider);
        final draft = await ai.summarise(widget.visitId);
        if (!mounted) return;
        final choice = await showDialog<_SummaryChoice?>(context: context, builder: (_) => _SummaryDialog(draft: draft));
        try {
          await ai.decide(draft.id, accept: choice != null, editedSummary: choice?.draft, followUps: choice?.followUps);
        } catch (_) {
          _toast('Your decision could not be recorded yet.');
        }
        if (choice != null) await widget.onSummary(choice.draft, choice.followUps);
      });

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(aiStatusProvider);
    if (!widget.enabled || status.value?.available != true) return const SizedBox.shrink();
    final db = ref.watch(databaseProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('AI assistant', style: TextStyle(fontWeight: FontWeight.w600)),
      const SizedBox(height: 4),
      Text(
        'Notes and voice notes are sent to Azure OpenAI with names and phone numbers removed. Do not dictate patient information. You always review the result before it is used.',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      const SizedBox(height: 8),
      StreamBuilder<List<Attachment>>(
        stream: db.watchAttachments(widget.visitId),
        builder: (context, snap) {
          final notes = (snap.data ?? const <Attachment>[]).where((a) => a.kind == 'VoiceNote' && a.uploadStatus == 'uploaded').toList();
          return Wrap(spacing: 8, runSpacing: 8, children: [
            for (final n in notes)
              OutlinedButton.icon(
                onPressed: _busy ? null : () => _transcribe(n),
                icon: const Icon(Icons.subtitles),
                label: Text('Transcribe voice note${n.durationMs == null ? '' : ' (${(n.durationMs! / 1000).round()}s)'}'),
              ),
            FilledButton.tonalIcon(
              onPressed: _busy ? null : _summarise,
              icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome),
              label: const Text('Draft summary with AI'),
            ),
          ]);
        },
      ),
    ]);
  }
}

class _AiBanner extends StatelessWidget {
  const _AiBanner();
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.secondaryContainer, borderRadius: BorderRadius.circular(8)),
        child: const Row(children: [Icon(Icons.auto_awesome, size: 18), SizedBox(width: 8), Expanded(child: Text('AI-generated draft. Check it before you use it.'))]),
      );
}

class _TranscriptDialog extends StatefulWidget {
  const _TranscriptDialog({required this.draft});
  final TranscriptDraft draft;
  @override
  State<_TranscriptDialog> createState() => _TranscriptDialogState();
}

class _TranscriptDialogState extends State<_TranscriptDialog> {
  late final _text = TextEditingController(text: widget.draft.text);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Voice note transcript'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const _AiBanner(),
            const SizedBox(height: 8),
            TextField(controller: _text, maxLines: 8, decoration: const InputDecoration(border: OutlineInputBorder())),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Discard')),
          FilledButton(onPressed: () => Navigator.pop(context, _text.text.trim()), child: const Text('Add to call notes')),
        ],
      );
}

class _SummaryChoice {
  const _SummaryChoice(this.draft, this.followUps);
  final SummaryDraft draft;
  final List<FollowUp> followUps;
}

class _SummaryDialog extends StatefulWidget {
  const _SummaryDialog({required this.draft});
  final SummaryDraft draft;
  @override
  State<_SummaryDialog> createState() => _SummaryDialogState();
}

class _SummaryDialogState extends State<_SummaryDialog> {
  late final _summary = TextEditingController(text: widget.draft.summary);
  late final _picked = <int>{for (var i = 0; i < widget.draft.followUps.length; i++) i};

  @override
  void dispose() {
    _summary.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.draft;
    return AlertDialog(
      title: const Text('Visit summary'),
      content: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          const _AiBanner(),
          const SizedBox(height: 8),
          TextField(controller: _summary, maxLines: 5, decoration: const InputDecoration(labelText: 'Summary (edit if needed)', border: OutlineInputBorder())),
          if (d.keyPoints.isNotEmpty) ...[const SizedBox(height: 8), const Text('Key points', style: TextStyle(fontWeight: FontWeight.w600)), for (final k in d.keyPoints) Text('• $k')],
          if (d.objections.isNotEmpty) ...[const SizedBox(height: 8), const Text('Objections', style: TextStyle(fontWeight: FontWeight.w600)), for (final o in d.objections) Text('• $o')],
          if (d.followUps.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Text('Add as follow-up tasks', style: TextStyle(fontWeight: FontWeight.w600)),
            for (var i = 0; i < d.followUps.length; i++)
              CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                value: _picked.contains(i),
                title: Text(d.followUps[i].title),
                subtitle: Text('due in ${d.followUps[i].dueInDays} day(s)'),
                onChanged: (v) => setState(() => v == true ? _picked.add(i) : _picked.remove(i)),
              ),
          ],
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Discard')),
        FilledButton(
          onPressed: _summary.text.trim().isEmpty
              ? null
              : () {
                  final edited = SummaryDraft(
                    id: d.id, summary: _summary.text.trim(), keyPoints: d.keyPoints, objections: d.objections, products: d.products,
                    followUps: d.followUps, sentiment: d.sentiment,
                  );
                  Navigator.pop(context, _SummaryChoice(edited, [for (final i in (_picked.toList()..sort())) d.followUps[i]]));
                },
          child: const Text('Use this summary'),
        ),
      ],
    );
  }
}
