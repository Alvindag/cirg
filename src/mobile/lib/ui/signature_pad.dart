import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

/// Collects finger/stylus strokes and exports them as a PNG (black on white).
class SignatureController extends ChangeNotifier {
  final List<List<Offset>> _strokes = [];
  Size _size = Size.zero;

  bool get isEmpty => _strokes.isEmpty;
  List<List<Offset>> get strokes => List.unmodifiable(_strokes);

  void start(Offset p) {
    _strokes.add([p]);
    notifyListeners();
  }

  void extend(Offset p) {
    if (_strokes.isEmpty) return;
    _strokes.last.add(p);
    notifyListeners();
  }

  void clear() {
    _strokes.clear();
    notifyListeners();
  }

  /// A dot or tiny scribble is not a signature.
  bool get hasEnoughInk {
    var length = 0.0;
    for (final s in _strokes) {
      for (var i = 1; i < s.length; i++) {
        length += (s[i] - s[i - 1]).distance;
      }
    }
    return length > 40;
  }

  /// Renders at 2x for a crisp image; returns null when nothing was drawn.
  Future<Uint8List?> toPng({double scale = 2}) async {
    if (isEmpty || _size.isEmpty) return null;
    final w = (_size.width * scale).round(), h = (_size.height * scale).round();
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), Paint()..color = Colors.white);
    canvas.scale(scale);
    paintStrokes(canvas, _strokes, Colors.black);
    final image = await recorder.endRecording().toImage(w, h);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  }

  static void paintStrokes(Canvas canvas, List<List<Offset>> strokes, Color color) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final s in strokes) {
      if (s.length == 1) {
        canvas.drawCircle(s.first, 1.25, paint..style = PaintingStyle.fill);
        paint.style = PaintingStyle.stroke;
      } else {
        final path = Path()..moveTo(s.first.dx, s.first.dy);
        for (final p in s.skip(1)) {
          path.lineTo(p.dx, p.dy);
        }
        canvas.drawPath(path, paint);
      }
    }
  }
}

class SignaturePad extends StatelessWidget {
  const SignaturePad({super.key, required this.controller, this.height = 180});
  final SignatureController controller;
  final double height;

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.grey), borderRadius: BorderRadius.circular(8)),
        child: LayoutBuilder(builder: (context, c) {
          controller._size = Size(c.maxWidth, c.maxHeight);
          // The pad sits inside a scrolling dialog. Without this, the first vertical movement of the pen is taken by the scroll view and the stroke
          // is cut off. The "eager" recognizer claims the touch at once, so scrolling never starts here, and the raw pointer events draw the line.
          return RawGestureDetector(
            gestures: {
              EagerGestureRecognizer: GestureRecognizerFactoryWithHandlers<EagerGestureRecognizer>(() => EagerGestureRecognizer(), (_) {}),
            },
            child: Listener(
              behavior: HitTestBehavior.opaque,
              onPointerDown: (e) => controller.start(e.localPosition),
              onPointerMove: (e) => controller.extend(e.localPosition),
              child: ListenableBuilder(
                listenable: controller,
                builder: (context, _) => CustomPaint(
                  size: Size.infinite,
                  painter: _PadPainter(controller.strokes),
                  child: controller.isEmpty ? const Center(child: Text('Sign here', style: TextStyle(color: Colors.black38))) : null,
                ),
              ),
            ),
          );
        }),
      );
}

class _PadPainter extends CustomPainter {
  _PadPainter(this.strokes);
  final List<List<Offset>> strokes;

  @override
  void paint(Canvas canvas, Size size) => SignatureController.paintStrokes(canvas, strokes, Colors.black);

  @override
  bool shouldRepaint(covariant _PadPainter old) => true;
}

class SignatureResult {
  const SignatureResult(this.png, this.signerName, this.meaning);
  final Uint8List png;
  final String signerName;
  final String meaning;
}

/// Asks the customer (e.g. the doctor or pharmacist) to sign, with their name and what they are confirming.
Future<SignatureResult?> showSignatureDialog(BuildContext context, {String? suggestedName, String? initialMeaning}) => showDialog<SignatureResult>(
      context: context,
      builder: (_) => _SignatureDialog(suggestedName: suggestedName, initialMeaning: initialMeaning),
    );

class _SignatureDialog extends StatefulWidget {
  const _SignatureDialog({this.suggestedName, this.initialMeaning});
  final String? suggestedName;
  final String? initialMeaning;
  @override
  State<_SignatureDialog> createState() => _SignatureDialogState();
}

class _SignatureDialogState extends State<_SignatureDialog> {
  static const meanings = ['Visit attended', 'Samples received', 'Product detailing acknowledged'];
  final _pad = SignatureController();
  late final _name = TextEditingController(text: widget.suggestedName ?? '');
  late String _meaning = meanings.contains(widget.initialMeaning) ? widget.initialMeaning! : meanings.first;
  String? _error;

  @override
  void dispose() {
    _pad.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _done() async {
    if (_name.text.trim().isEmpty) return setState(() => _error = 'Enter the signer\'s name.');
    if (!_pad.hasEnoughInk) return setState(() => _error = 'Please sign in the box.');
    final png = await _pad.toPng();
    if (png == null) return setState(() => _error = 'Please sign in the box.');
    if (mounted) Navigator.pop(context, SignatureResult(png, _name.text.trim(), _meaning));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Customer signature'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Signer name')),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _meaning,
              decoration: const InputDecoration(labelText: 'Confirms'),
              items: [for (final m in meanings) DropdownMenuItem(value: m, child: Text(m))],
              onChanged: (v) => setState(() => _meaning = v ?? _meaning),
            ),
            const SizedBox(height: 12),
            SignaturePad(controller: _pad),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          ]),
        ),
        actions: [
          TextButton(onPressed: _pad.clear, child: const Text('Clear')),
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: _done, child: const Text('Accept')),
        ],
      );
}
