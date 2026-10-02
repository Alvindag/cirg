import 'package:record/record.dart';

/// How voice notes are recorded. Speech through the phone's own voice processing (noise suppression, echo cancellation, automatic gain)
/// at a higher quality than before (the old 22 kHz / 48 kbps setting made speech sound thin and bumpy).
const voiceNoteConfig = RecordConfig(
  encoder: AudioEncoder.aacLc,
  bitRate: 64000,
  sampleRate: 44100,
  numChannels: 1,
  autoGain: true,
  echoCancel: true,
  noiseSuppress: true,
  androidConfig: AndroidRecordConfig(audioSource: AndroidAudioSource.voiceCommunication),
);

/// A short pause after the button is tapped before recording starts, so the thump of the tap itself is not on the recording.
const voiceNoteStartDelay = Duration(milliseconds: 350);
