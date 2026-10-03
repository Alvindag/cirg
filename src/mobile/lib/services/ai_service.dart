import 'dart:convert';

import '../data/database.dart';
import 'api_client.dart';

/// The server refused or could not complete an AI request. The message is safe to show to the rep.
class AiException implements Exception {
  AiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class AiStatus {
  const AiStatus({required this.available, this.reason, this.usedToday = 0, this.dailyLimit = 0});
  final bool available;
  final String? reason;
  final int usedToday;
  final int dailyLimit;
}

class FollowUp {
  const FollowUp(this.title, this.dueInDays);
  final String title;
  final int dueInDays;
  Map<String, dynamic> toJson() => {'title': title, 'dueInDays': dueInDays};
}

/// An AI draft the rep must review. Nothing is used until it is accepted.
class SummaryDraft {
  SummaryDraft({
    required this.id,
    required this.summary,
    required this.keyPoints,
    required this.objections,
    required this.products,
    required this.followUps,
    required this.sentiment,
  });
  final String id;
  final String summary;
  final List<String> keyPoints;
  final List<String> objections;
  final List<String> products;
  final List<FollowUp> followUps;
  final String sentiment;
}

class TranscriptDraft {
  const TranscriptDraft(this.id, this.text);
  final String id;
  final String text;
}

class RoutePlan {
  const RoutePlan({required this.originalKm, required this.optimizedKm, required this.stops, required this.applied});
  final double originalKm;
  final double optimizedKm;
  final List<String> stops;
  final bool applied;
  bool get improves => optimizedKm < originalKm - 0.05;
}

/// Online AI features (voice-to-text, visit summaries, route optimisation) and the cached next-best-action list.
/// Generative calls need a connection; suggestions are cached on the device so they work offline.
class AiService {
  AiService(this._api, this._db);
  final ApiClient _api;
  final AppDatabase _db;

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on ApiException catch (e) {
      throw AiException(e.message.isEmpty ? 'The request failed (${e.statusCode}).' : e.message, statusCode: e.statusCode);
    }
  }

  Future<AiStatus> status() => _guard(() async {
        final j = await _api.getJson('/ai/status') as Map;
        return AiStatus(
          available: j['available'] == true,
          reason: j['reason'] as String?,
          usedToday: (j['usedToday'] as num?)?.toInt() ?? 0,
          dailyLimit: (j['dailyLimit'] as num?)?.toInt() ?? 0,
        );
      });

  /// The voice note must already be uploaded (the server reads it from storage).
  Future<TranscriptDraft> transcribe(String attachmentId, {String? language}) => _guard(() async {
        final j = await _api.postJson('/ai/transcriptions', {'attachmentId': attachmentId, 'language': language}) as Map;
        return TranscriptDraft(j['id'] as String, (j['content'] as String?) ?? '');
      });

  /// The call report and any transcripts must already be on the server (sync first).
  Future<SummaryDraft> summarise(String visitId, {String? extraNotes}) => _guard(() async {
        final j = await _api.postJson('/ai/visit-summaries', {'visitId': visitId, 'notes': extraNotes}) as Map;
        final c = j['content'];
        final body = c is String ? _decode(c) : c as Map;
        List<String> strings(String k) => ((body[k] as List?) ?? const []).whereType<String>().toList();
        return SummaryDraft(
          id: j['id'] as String,
          summary: (body['summary'] as String?) ?? '',
          keyPoints: strings('keyPoints'),
          objections: strings('objections'),
          products: strings('productsDiscussed'),
          followUps: ((body['followUps'] as List?) ?? const [])
              .whereType<Map>()
              .map((f) => FollowUp(f['title'] as String, (f['dueInDays'] as num?)?.toInt() ?? 7))
              .toList(),
          sentiment: (body['sentiment'] as String?) ?? 'Neutral',
        );
      });

  /// Records the rep's decision. The app applies accepted text locally (so it travels with the normal sync); the server only keeps the register.
  Future<void> decide(String outputId, {required bool accept, String? editedText, SummaryDraft? editedSummary, List<FollowUp>? followUps}) => _guard(() async {
        await _api.postJson('/ai/outputs/$outputId/decision', {
          'status': accept ? 'Accepted' : 'Rejected',
          'editedText': editedText,
          if (editedSummary != null)
            'editedSummary': {
              'summary': editedSummary.summary,
              'keyPoints': editedSummary.keyPoints,
              'objections': editedSummary.objections,
              'productsDiscussed': editedSummary.products,
              'followUps': (followUps ?? editedSummary.followUps).map((f) => f.toJson()).toList(),
              'sentiment': editedSummary.sentiment,
            },
          'applyToReport': false,
        });
      });

  /// Downloads today's suggestions and keeps them on the device. Failures are ignored: the old list stays.
  Future<void> refreshActions() async {
    try {
      final list = await _api.getJson('/ai/next-best-actions', {'max': '8'}) as List;
      await _db.replaceNextActions(list.cast<Map<String, dynamic>>());
    } catch (_) {}
  }

  Future<RoutePlan> optimiseRoute(DateTime day, {double? latitude, double? longitude, bool apply = false}) => _guard(() async {
        final d = '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
        final j = await _api.postJson('/ai/routes/optimize', {
          'date': d,
          'startLatitude': latitude,
          'startLongitude': longitude,
          'apply': apply,
        }) as Map;
        return RoutePlan(
          originalKm: (j['originalKm'] as num).toDouble(),
          optimizedKm: (j['optimizedKm'] as num).toDouble(),
          stops: ((j['order'] as List?) ?? const []).whereType<Map>().map((s) => (s['name'] as String?) ?? 'Customer').toList(),
          applied: j['applied'] == true,
        );
      });

  static Map _decode(String s) => jsonDecode(s) as Map;
}
