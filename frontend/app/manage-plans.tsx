import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";

type Plan = {
  plan_id: string;
  name: string;
  duration_months: number;
  price_inr: number;
  description?: string;
};

const EMPTY_FORM = { name: "", duration_months: "", price_inr: "", description: "" };

export default function ManagePlans() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api<Plan[]>("/plans");
      setPlans(p);
    } catch { } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => {
    setEditingPlan(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalVisible(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      duration_months: String(plan.duration_months),
      price_inr: String(plan.price_inr),
      description: plan.description || "",
    });
    setError(null);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingPlan(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const onSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError("Plan name is required."); return; }
    if (!form.price_inr || isNaN(Number(form.price_inr)) || Number(form.price_inr) <= 0) {
      setError("Enter a valid price."); return;
    }
    if (!editingPlan && (!form.duration_months || isNaN(Number(form.duration_months)) || Number(form.duration_months) <= 0)) {
      setError("Enter a valid duration in months."); return;
    }
    setBusy(true);
    try {
      if (editingPlan) {
        // Update existing plan
        await api(`/manager/plans/${editingPlan.plan_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            price_inr: Number(form.price_inr),
            description: form.description.trim(),
          }),
        });
      } else {
        // Create new plan
        await api("/manager/plans", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            duration_months: Number(form.duration_months),
            price_inr: Number(form.price_inr),
            description: form.description.trim(),
          }),
        });
      }
      closeModal();
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to save plan");
    } finally { setBusy(false); }
  };

  const onDelete = (plan: Plan) => {
    Alert.alert(
      "DELETE PLAN?",
      `This will permanently delete "${plan.name}". Members with this plan will keep their existing membership.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await api(`/manager/plans/${plan.plan_id}`, { method: "DELETE" });
              await load();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete plan");
            }
          },
        },
      ]
    );
  };

  const DURATION_LABEL = (months: number) => {
    if (months === 1) return "1 Month";
    if (months < 12) return `${months} Months`;
    if (months === 12) return "1 Year";
    return `${months} Months`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>MANAGE PLANS</Text>
        <Pressable onPress={openAdd} hitSlop={12}>
          <Ionicons name="add-circle" size={26} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <Text style={[displayStyle(28), { fontSize: 28, marginBottom: spacing.xs }]}>GYM PLANS</Text>
        <Text style={styles.subtitle}>Changes reflect instantly for all members.</Text>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxxl }} />
        ) : plans.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>NO PLANS YET</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first plan</Text>
          </View>
        ) : (
          plans.map((plan) => (
            <View key={plan.plan_id} style={styles.planCard}>
              <View style={styles.planTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>{plan.name.toUpperCase()}</Text>
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={12} color={colors.muted} />
                    <Text style={styles.durationText}>{DURATION_LABEL(plan.duration_months)}</Text>
                  </View>
                </View>
                <Text style={styles.planPrice}>₹{plan.price_inr.toLocaleString("en-IN")}</Text>
              </View>
              {plan.description ? (
                <Text style={styles.planDesc}>{plan.description}</Text>
              ) : null}
              <View style={styles.planActions}>
                <Pressable
                  onPress={() => openEdit(plan)}
                  style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="create-outline" size={16} color={colors.onSurface} />
                  <Text style={styles.editBtnText}>EDIT</Text>
                </Pressable>
                <Pressable
                  onPress={() => onDelete(plan)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.brand2} />
                  <Text style={styles.deleteBtnText}>DELETE</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {/* Add Plan Button */}
        <Pressable
          onPress={openAdd}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={20} color={colors.onSurface} />
          <Text style={styles.addBtnText}>ADD NEW PLAN</Text>
        </Pressable>
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <Text style={[displayStyle(22), { fontSize: 22, marginBottom: spacing.xl }]}>
              {editingPlan ? "EDIT PLAN" : "NEW PLAN"}
            </Text>

            <Text style={styles.fieldLabel}>PLAN NAME *</Text>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm(f => ({ ...f, name: v }))}
              placeholder="e.g. Monthly, Annual..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="words"
            />

            {/* Duration only for new plans */}
            {!editingPlan ? (
              <>
                <Text style={styles.fieldLabel}>DURATION (MONTHS) *</Text>
                <TextInput
                  value={form.duration_months}
                  onChangeText={(v) => setForm(f => ({ ...f, duration_months: v }))}
                  placeholder="e.g. 1, 3, 6, 12"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  style={styles.input}
                />
                <Text style={styles.fieldHint}>Duration cannot be changed after creation.</Text>
              </>
            ) : (
              <View style={styles.lockedField}>
                <Ionicons name="lock-closed" size={14} color={colors.muted} />
                <Text style={styles.lockedText}>
                  DURATION: {DURATION_LABEL(editingPlan.duration_months)} (cannot be changed)
                </Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>PRICE (₹) *</Text>
            <TextInput
              value={form.price_inr}
              onChangeText={(v) => setForm(f => ({ ...f, price_inr: v }))}
              placeholder="e.g. 1000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              value={form.description}
              onChangeText={(v) => setForm(f => ({ ...f, description: v }))}
              placeholder="e.g. Full gym access for 1 month"
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 72, textAlignVertical: "top", paddingTop: 12 }]}
              multiline
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable
                onPress={closeModal}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.cancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={busy}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
              >
                {busy ? <ActivityIndicator color={colors.onSurface} /> : (
                  <Text style={styles.saveText}>{editingPlan ? "SAVE CHANGES" : "CREATE PLAN"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800", letterSpacing: 1.5 },
  subtitle: { color: colors.onSurface3, fontSize: 13, marginBottom: spacing.xl },
  planCard: {
    backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  planTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
  planName: { color: colors.onSurface, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  durationBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  durationText: { color: colors.muted, fontSize: 12 },
  planPrice: { color: colors.brand, fontSize: 22, fontWeight: "800" },
  planDesc: { color: colors.onSurface3, fontSize: 13, marginBottom: spacing.md, lineHeight: 18 },
  planActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  editBtn: {
    flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface3, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  editBtnText: { color: colors.onSurface, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  deleteBtn: {
    flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(198,40,40,0.12)", paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brand2,
  },
  deleteBtnText: { color: colors.brand2, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  addBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, marginTop: spacing.sm,
  },
  addBtnText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 14 },
  empty: { alignItems: "center", paddingTop: spacing.xxxl, gap: spacing.md },
  emptyText: { color: colors.muted, fontWeight: "800", letterSpacing: 2, fontSize: 14 },
  emptySubtext: { color: colors.muted, fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: colors.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, borderTopWidth: 1, borderColor: colors.border,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: "center", marginBottom: spacing.lg,
  },
  fieldLabel: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginBottom: 6, marginTop: spacing.md },
  fieldHint: { color: colors.muted, fontSize: 11, marginTop: 4, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface, color: colors.onSurface, paddingHorizontal: spacing.md,
    paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  lockedField: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: colors.surface3, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.md, marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  lockedText: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  errorText: { color: colors.brand2, fontSize: 13, marginTop: spacing.md },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center",
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3,
  },
  cancelText: { color: colors.onSurface2, fontWeight: "800", letterSpacing: 1.2, fontSize: 13 },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: radius.md, alignItems: "center",
    justifyContent: "center", backgroundColor: colors.brand,
  },
  saveText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 13 },
});
