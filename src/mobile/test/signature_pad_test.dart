import 'package:das_engage/services/voice_config.dart';
import 'package:das_engage/ui/signature_pad.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:record/record.dart';

void main() {
  Widget host(SignatureController c, ScrollController scroll) => MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            controller: scroll,
            child: Column(children: [const SizedBox(height: 100), SignaturePad(controller: c), const SizedBox(height: 1500)]),
          ),
        ),
      );

  testWidgets('a mostly vertical stroke is drawn in full and does not scroll the dialog or page behind it', (tester) async {
    final c = SignatureController();
    final scroll = ScrollController();
    await tester.pumpWidget(host(c, scroll));
    final g = await tester.startGesture(tester.getCenter(find.byType(SignaturePad)));
    for (var i = 0; i < 12; i++) {
      await g.moveBy(const Offset(1, 8)); // nearly straight down: exactly what a scroll view wants to take over
      await tester.pump();
    }
    await g.up();
    expect(scroll.offset, 0);
    expect(c.strokes, hasLength(1));
    expect(c.strokes.single.length, greaterThan(10));
    expect(c.hasEnoughInk, isTrue);
  });

  testWidgets('several strokes, a dot and Clear work, and a stroke starting outside the pad draws nothing', (tester) async {
    final c = SignatureController();
    final scroll = ScrollController();
    await tester.pumpWidget(host(c, scroll));
    final centre = tester.getCenter(find.byType(SignaturePad));
    for (final dx in [-60.0, 0.0, 60.0]) {
      final g = await tester.startGesture(centre + Offset(dx, -20));
      for (var i = 0; i < 6; i++) {
        await g.moveBy(const Offset(8, 8));
        await tester.pump();
      }
      await g.up();
    }
    expect(c.strokes, hasLength(3));
    final outside = await tester.startGesture(const Offset(10, 20)); // above the pad
    await outside.moveBy(const Offset(0, -30));
    await outside.up();
    expect(c.strokes, hasLength(3));
    c.clear();
    expect(c.isEmpty, isTrue);
  });

  test('voice notes use the phone\'s voice processing at a speech-friendly quality', () {
    expect(voiceNoteConfig.noiseSuppress, isTrue);
    expect(voiceNoteConfig.echoCancel, isTrue);
    expect(voiceNoteConfig.autoGain, isTrue);
    expect(voiceNoteConfig.numChannels, 1);
    expect(voiceNoteConfig.sampleRate, greaterThanOrEqualTo(32000));
    expect(voiceNoteConfig.bitRate, greaterThanOrEqualTo(64000));
    expect(voiceNoteConfig.encoder, AudioEncoder.aacLc);
    expect(voiceNoteStartDelay, greaterThan(Duration.zero));
  });
}
