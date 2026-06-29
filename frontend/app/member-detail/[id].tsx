import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking,
  TextInput, Modal, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { colors, spacing, radius, displayStyle } from "@/src/theme";
import { api } from "@/src/api";

type Plan = { plan_id: string; name: string; duration_months: number; price_inr: number };
type Member = {
  user: { user_id: string; name: string; email: string; phone?: string | null; picture?: string | null };
  current: { plan_name: string; expires_at: string; duration_months: number; amount: number } | null;
  history: any[];
};

function daysFromNow(date: string) { return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000); }

export default function MemberDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Member | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editPhoto, setEditPhoto] = useState<string | null>(null);

  const pickMemberPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Allow photo library access."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setEditPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const takeMemberPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Allow camera access."); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setEditPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const onEditPhotoPress = () => {
    Alert.alert("Member Photo", "Choose an option", [
      { text: "Take Photo", onPress: takeMemberPhoto },
      { text: "Choose from Library", onPress: pickMemberPhoto },
      { text: "Remove Photo", onPress: () => setEditPhoto("remove"), style: "destructive" },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([
        api<Member>(`/manager/members/${id}`),
        api<Plan[]>("/plans"),
      ]);
      setData(m);
      setPlans(p);
    } catch { /* silently ignore */ } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const recordCash = async () => {
    if (!selectedPlan) return;
    setRecording(true);
    setFeedback(null);
    try {
      await api("/manager/record-cash", {
        method: "POST",
        body: JSON.stringify({ user_id: id, plan_id: selectedPlan }),
      });
      setFeedback("Cash payment recorded. Membership activated.");
      setSelectedPlan(null);
      await load();
    } catch (e: any) {
      setFeedback(e.message || "Failed to record");
    } finally { setRecording(false); }
  };

  const startEdit = () => {
    if (!data) return;
    setEditName(data.user.name);
    setEditPhone(data.user.phone || "");
    setEditPhoto(null);
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) {
      setFeedback("Name cannot be empty");
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const photoToSend = editPhoto === "remove" ? "" : (editPhoto || undefined);
      await api(`/manager/members/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim(), picture: photoToSend }),
      });
      setEditMode(false);
      setFeedback("Member updated.");
      await load();
    } catch (e: any) {
      setFeedback(e.message || "Update failed");
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api(`/manager/members/${id}`, { method: "DELETE" });
      setConfirmDelete(false);
      router.back();
    } catch (e: any) {
      setFeedback(e.message || "Delete failed");
      setDeleting(false);
    }
  };

  if (loading || !data) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const member = data.user;
  const days = data.current ? daysFromNow(data.current.expires_at) : null;
  const isActive = days !== null && days >= 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="member-detail-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="detail-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>MEMBER</Text>
        <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
          {!editMode ? (
            <Pressable testID="edit-member-button" onPress={startEdit} hitSlop={10}>
              <Ionicons name="create-outline" size={22} color={colors.onSurface} />
            </Pressable>
          ) : null}
          <Pressable testID="delete-member-button" onPress={() => setConfirmDelete(true)} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color={colors.brand2} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
        {/* Profile / Edit */}
        {editMode ? (
          <View style={styles.editCard} testID="edit-form">
            <Text style={styles.sectionLabel}>EDIT MEMBER</Text>
            {/* Photo picker in edit mode */}
            <View style={{ alignItems: "center", marginBottom: spacing.md }}>
              <Pressable onPress={onEditPhotoPress} style={{ alignItems: "center" }}>
                {editPhoto && editPhoto !== "remove" ? (
                  <Image source={{ uri: editPhoto }} style={styles.editAvatar} />
                ) : editPhoto === "remove" ? (
                  <View style={[styles.editAvatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="person" color={colors.onSurface2} size={28} />
                  </View>
                ) : data?.user.picture ? (
                  <Image source={{ uri: data.user.picture }} style={styles.editAvatar} />
                ) : (
                  <View style={[styles.editAvatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="person" color={colors.onSurface2} size={28} />
                  </View>
                )}
                <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 6 }}>CHANGE PHOTO</Text>
              </Pressable>
            </View>
            <Text style={styles.editLabel}>NAME</Text>
            <TextInput
              testID="edit-name-input"
              value={editName}
              onChangeText={setEditName}
              placeholderTextColor={colors.muted}
              style={styles.editInput}
            />
            <Text style={styles.editLabel}>PHONE</Text>
            <TextInput
              testID="edit-phone-input"
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              placeholderTextColor={colors.muted}
              style={styles.editInput}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable
                testID="edit-cancel"
                onPress={() => setEditMode(false)}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.cancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                testID="edit-save"
                onPress={saveEdit}
                disabled={saving}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
              >
                {saving ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.saveText}>SAVE</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.profile}>
            {member.picture ? (
              <Image source={{ uri: member.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="person" color={colors.onSurface2} size={28} />
              </View>
            )}
            <Text style={styles.name}>{member.name}</Text>
            <Text style={styles.email}>{member.email}</Text>
            {member.phone ? (
              <Pressable
                testID="call-member-button"
                onPress={() => Linking.openURL(`tel:${member.phone}`)}
                style={styles.callBtn}
              >
                <Ionicons name="call" size={16} color={colors.onSurface} />
                <Text style={styles.callText}>{member.phone}</Text>
              </Pressable>
            ) : <Text style={styles.noPhone}>No phone number on file</Text>}
          </View>
        )}

        {/* Current Plan */}
        <Text style={styles.sectionLabel}>CURRENT PLAN</Text>
        {data.current ? (
          <View style={[styles.statusCard, { borderColor: isActive ? (days! <= 5 ? colors.warning : colors.success) : colors.brand2 }]}>
            <Text style={[displayStyle(48), { fontSize: 48, color: isActive ? colors.brand : colors.brand2 }]}>
              {isActive ? days : `${Math.abs(days!)}`}
            </Text>
            <Text style={styles.statusMeta}>{isActive ? "days remaining" : "days expired"}</Text>
            <Text style={styles.planName}>{data.current.plan_name.toUpperCase()}</Text>
            <Text style={styles.expiry}>Expires {new Date(data.current.expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text>
          </View>
        ) : (
          <View style={[styles.statusCard, { borderColor: colors.muted }]}>
            <Text style={[displayStyle(24), { fontSize: 22, color: colors.muted }]}>NO PLAN ON RECORD</Text>
          </View>
        )}

        {/* Record cash */}
        <Text style={styles.sectionLabel}>RECORD CASH PAYMENT</Text>
        <Text style={styles.helperText}>Select a plan member paid for in cash at the gym.</Text>
        <View style={styles.planGrid}>
          {plans.map(p => {
            const sel = selectedPlan === p.plan_id;
            return (
              <Pressable
                key={p.plan_id}
                testID={`select-plan-${p.plan_id}`}
                onPress={() => setSelectedPlan(p.plan_id)}
                style={[styles.planChip, sel && styles.planChipActive]}
              >
                <Text style={[styles.planChipName, sel && { color: colors.onSurface }]}>{p.name.toUpperCase()}</Text>
                <Text style={[styles.planChipPrice, sel && { color: colors.onSurface }]}>₹{p.price_inr}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          testID="record-cash-button"
          onPress={recordCash}
          disabled={!selectedPlan || recording}
          style={({ pressed }) => [
            styles.recordBtn,
            (!selectedPlan || recording) && { opacity: 0.5 },
            pressed && { opacity: 0.8 },
          ]}
        >
          {recording ? <ActivityIndicator color={colors.onSurface} /> : (
            <>
              <Ionicons name="cash" size={18} color={colors.onSurface} />
              <Text style={styles.recordText}>RECORD CASH PAYMENT</Text>
            </>
          )}
        </Pressable>

        {feedback ? <Text style={styles.feedback} testID="record-feedback">{feedback}</Text> : null}

        {/* History */}
        <Text style={styles.sectionLabel}>PAYMENT HISTORY</Text>
        {data.history.length === 0 ? (
          <Text style={styles.helperText}>No payment history.</Text>
        ) : data.history.map((h: any) => (
          <View key={h.membership_id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.histPlan}>{h.plan_name.toUpperCase()}</Text>
              <Text style={styles.histDate}>
                {new Date(h.started_at).toLocaleDateString("en-IN")} → {new Date(h.expires_at).toLocaleDateString("en-IN")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.histAmount}>₹{h.amount}</Text>
              <Text style={[styles.histMethod, { color: h.payment_method === "cash" ? colors.warning : colors.success }]}>
                {h.payment_method.toUpperCase()}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="delete-confirm-modal">
            <Ionicons name="alert-circle" size={36} color={colors.brand2} style={{ alignSelf: "center" }} />
            <Text style={styles.modalTitle}>DELETE MEMBER?</Text>
            <Text style={styles.modalBody}>
              This permanently removes {member.name} and all their payment history. This cannot be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable
                testID="delete-cancel"
                onPress={() => setConfirmDelete(false)}
                disabled={deleting}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.cancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                testID="delete-confirm"
                onPress={doDelete}
                disabled={deleting}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}
              >
                {deleting ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.deleteText}>DELETE</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface,
  },
  headerTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800", letterSpacing: 1.5 },
  profile: { alignItems: "center", marginBottom: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: spacing.sm },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  email: { color: colors.onSurface3, fontSize: 13, marginTop: 2 },
  callBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", marginTop: spacing.md,
    backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.md,
  },
  callText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  noPhone: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, fontStyle: "italic" },
  sectionLabel: { color: colors.onSurface3, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.sm },
  statusCard: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, backgroundColor: colors.surface2 },
  statusMeta: { color: colors.onSurface3, fontSize: 12, letterSpacing: 1, fontWeight: "700" },
  planName: { color: colors.onSurface, fontWeight: "800", marginTop: spacing.md, letterSpacing: 0.5 },
  expiry: { color: colors.onSurface3, fontSize: 12, marginTop: 4 },
  helperText: { color: colors.muted, fontSize: 12, marginBottom: spacing.sm },
  planGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  planChip: {
    paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, minWidth: "47%", alignItems: "center",
  },
  planChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  planChipName: { color: colors.onSurface, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  planChipPrice: { color: colors.onSurface3, fontSize: 13, marginTop: 2, fontWeight: "600" },
  recordBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md,
  },
  recordText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 14 },
  feedback: { color: colors.success, marginTop: spacing.md, fontSize: 13 },
  histRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  histPlan: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  histDate: { color: colors.onSurface3, fontSize: 12, marginTop: 2 },
  histAmount: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  histMethod: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  editCard: {
    backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  editLabel: { color: colors.onSurface3, fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginBottom: 6, marginTop: spacing.md },
  editAvatar: { width: 80, height: 80, borderRadius: 40 },
  editInput: {
    backgroundColor: colors.surface, color: colors.onSurface,
    paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center",
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3,
  },
  cancelText: { color: colors.onSurface2, fontWeight: "800", letterSpacing: 1.2, fontSize: 13 },
  saveBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand,
  },
  saveText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 13 },
  deleteBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.error,
  },
  deleteText: { color: colors.onSurface, fontWeight: "800", letterSpacing: 1.2, fontSize: 13 },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.borderStrong, gap: spacing.sm,
  },
  modalTitle: { ...displayStyle(22), fontSize: 22, textAlign: "center", marginTop: spacing.sm },
  modalBody: { color: colors.onSurface3, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
