/**
 * App entry. Starts Expo Router and, on Android, registers the home-screen widget renderer
 * (M4-10, docs/WIDGETS.md), which the system also runs headless when the app is closed.
 */
import 'expo-router/entry';

import { registerWidgets } from './src/features/widget/registerWidgets';

registerWidgets();
