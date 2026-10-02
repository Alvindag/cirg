import 'package:flutter/material.dart';

/// DAS PLC colours, taken from the logo: red for identity, charcoal for structure, blue for actions.
/// Warnings and errors keep their own colours so red never means two things.
class Das {
  static const red = Color(0xFFD62028);
  static const charcoal = Color(0xFF3A3F43);
  static const blue = Color(0xFF0F5F9C);
  static const good = Color(0xFF17734A);
  static const warn = Color(0xFF8F5B00);
}

ThemeData dasTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final base = ColorScheme.fromSeed(seedColor: Das.blue, brightness: brightness);
  final scheme = base.copyWith(
    primary: dark ? const Color(0xFF6CB4F0) : Das.blue,
    onPrimary: dark ? const Color(0xFF08121C) : Colors.white,
    primaryContainer: dark ? const Color(0xFF172A3D) : const Color(0xFFE3EEF7),
    onPrimaryContainer: dark ? const Color(0xFFD6E9FA) : const Color(0xFF0B3F69),
    surface: dark ? const Color(0xFF141920) : Colors.white,
    onSurface: dark ? const Color(0xFFE9EEF3) : const Color(0xFF1D2125),
    outlineVariant: dark ? const Color(0xFF262E38) : const Color(0xFFDDE1E6),
    error: dark ? const Color(0xFFFF8F87) : const Color(0xFFB3261E),
  );
  final bg = dark ? const Color(0xFF0A0D12) : const Color(0xFFF3F4F6);
  const radius = 14.0;
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: Das.charcoal,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: scheme.surface,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius), side: BorderSide(color: scheme.outlineVariant)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: scheme.primaryContainer,
      labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: scheme.onSurface)),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)), minimumSize: const Size(0, 44))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)), minimumSize: const Size(0, 44))),
    floatingActionButtonTheme: FloatingActionButtonThemeData(backgroundColor: scheme.primary, foregroundColor: scheme.onPrimary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF1B222B) : Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: scheme.outlineVariant)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: scheme.outlineVariant)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: scheme.primary, width: 2)),
    ),
    chipTheme: ChipThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)), side: BorderSide(color: scheme.outlineVariant)),
    dialogTheme: DialogThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
    snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
  );
}

/// The DAS ring: red outside, blue centre.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 28});
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: Das.red, width: size * .14)),
        alignment: Alignment.center,
        child: Container(width: size * .42, height: size * .42, decoration: const BoxDecoration(shape: BoxShape.circle, color: Das.blue)),
      );
}

/// A friendly message with an icon, for screens with nothing to show yet.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(shape: BoxShape.circle, color: scheme.primaryContainer),
            child: Icon(icon, size: 40, color: scheme.primary),
          ),
          const SizedBox(height: 18),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(message!, textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurface.withValues(alpha: .65))),
          ],
          if (action != null) ...[const SizedBox(height: 16), action!],
        ]),
      ),
    );
  }
}
