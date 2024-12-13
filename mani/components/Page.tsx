import type { PropsWithChildren, ReactElement } from "react";
import { StyleSheet, View, Image } from "react-native";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from "react-native-reanimated";
// import { SvgUri } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/ThemedView";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { Row } from "./layout/row";
import { ThemedText } from "./ThemedText";
import { useColor } from "@/hooks/useColor";
import { Colors } from "@/constants/Colors";
import { TokenSlider } from "./TokenSlider";
import { SliderHeader } from "./layout/slider-header";

const HEADER_HEIGHT = 250;

export default function Page({ children }: PropsWithChildren) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const bottom = useBottomTabOverflow();

  const color = useColor();
  return (
    <SafeAreaView style={styles.container}>
      <SliderHeader />
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        scrollIndicatorInsets={{ bottom }}
        contentContainerStyle={{ paddingBottom: bottom }}
      >
        <ThemedView style={styles.content}>{children}</ThemedView>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    gap: 16,
    overflow: "hidden",
  },
});
