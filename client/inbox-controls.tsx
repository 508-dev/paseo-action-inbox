import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";

export function InboxButton({
  children,
  onPress,
  theme,
  compact,
  disabled,
  selected,
  label,
  testID,
  icon,
  variant = "ghost",
  danger = false,
}: {
  children?: ReactNode;
  onPress(): void;
  theme: PluginTheme;
  compact: boolean;
  disabled?: boolean;
  selected?: boolean;
  label?: string;
  testID?: string;
  icon?: string;
  variant?: "solid" | "outline" | "ghost";
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (typeof children === "string" ? children : undefined)}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: compact ? 44 : 32,
        minWidth: compact ? 44 : 32,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        justifyContent: "center",
        borderRadius: 6,
        opacity: disabled ? 0.5 : pressed && variant === "solid" ? 0.85 : 1,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor: theme.colors.border,
        backgroundColor:
          variant === "solid"
            ? theme.colors.accent
            : selected || pressed
              ? theme.colors.surface2
              : "transparent",
      })}
    >
      {icon ? (
        <Icon
          name={icon}
          size={15}
          color={
            danger
              ? theme.colors.statusDanger
              : variant === "solid"
                ? theme.colors.accentForeground
                : theme.colors.foreground
          }
        />
      ) : null}
      {children ? (
        <Text
          style={{
            color: danger
              ? theme.colors.statusDanger
              : variant === "solid"
                ? theme.colors.accentForeground
                : theme.colors.foreground,
            fontSize: 13,
            fontWeight: variant === "solid" ? "500" : "400",
          }}
        >
          {children}
        </Text>
      ) : null}
    </Pressable>
  );
}

export interface FilterOption {
  value: string;
  label: string;
  description?: string;
}

export function InboxFilter({
  title,
  allLabel,
  value,
  options,
  onChange,
  theme,
  compact,
}: {
  title: string;
  allLabel: string;
  value: string | null;
  options: FilterOption[];
  onChange(value: string | null): void;
  theme: PluginTheme;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const label = selected?.label ?? (value ? `Selected ${title.toLowerCase()}` : allLabel);
  const choices = [{ value: "", label: allLabel }, ...options].filter((option) =>
    `${option.label} ${"description" in option ? option.description : ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={({ pressed }) => ({
          minHeight: compact ? 44 : 32,
          paddingHorizontal: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderRadius: 6,
          backgroundColor: pressed || value ? theme.colors.surface2 : theme.colors.surface1,
          maxWidth: compact ? "48%" : 250,
        })}
      >
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.foreground, fontSize: 13, flexShrink: 1 }}
        >
          {label}
        </Text>
        <Icon name="ChevronDown" size={14} color={theme.colors.foregroundMuted} />
      </Pressable>
      <Modal title={`Filter by ${title.toLowerCase()}`} open={open} onOpenChange={setOpen}>
        <Modal.Content contentContainerStyle={{ padding: 12, gap: 4 }}>
          <TextInput
            accessibilityLabel={`Search ${title.toLowerCase()}`}
            placeholder={`Search ${title.toLowerCase()}`}
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={theme.colors.foregroundMuted}
            style={{
              color: theme.colors.foreground,
              backgroundColor: theme.colors.surface2,
              borderRadius: 6,
              padding: 12,
              marginBottom: 8,
            }}
          />
          {choices.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: (value ?? "") === option.value }}
              onPress={() => {
                onChange(option.value || null);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                gap: 12,
                borderRadius: 6,
                backgroundColor: pressed ? theme.colors.surface2 : "transparent",
              })}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: theme.colors.foreground }}>{option.label}</Text>
                {"description" in option && option.description ? (
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                    {option.description}
                  </Text>
                ) : null}
              </View>
              {(value ?? "") === option.value ? (
                <Icon name="Check" size={16} color={theme.colors.foreground} />
              ) : null}
            </Pressable>
          ))}
          {choices.length === 0 ? (
            <Text style={{ color: theme.colors.foregroundMuted, padding: 12 }}>No matches</Text>
          ) : null}
        </Modal.Content>
      </Modal>
    </>
  );
}
