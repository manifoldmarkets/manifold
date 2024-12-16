import React, { forwardRef } from "react";
import { View, StyleSheet } from "react-native";

export const Row = forwardRef<
  View,
  {
    children?: React.ReactNode;
    style?: any;
  }
>(function Row(props, ref) {
  const { children, style, ...rest } = props;
  return (
    <View style={[styles.row, style]} ref={ref} {...rest}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
});
