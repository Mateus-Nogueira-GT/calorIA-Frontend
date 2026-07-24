import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius } from '@theme';
import { Card } from '@shared/components/Card';
import { Button } from '@shared/components/Button';
import { formatChipLabel } from '@shared/utils/date';
import type { Challenge } from '@shared/services/challenges.service';

interface Props {
  challenge: Challenge;
  onPress: () => void;
  onJoin: () => void;
  joining: boolean;
  /** Check-in do dia (só para desafios ativos em que participo). */
  onCheckIn?: () => void;
}

export function ChallengeCard({
  challenge,
  onPress,
  onJoin,
  joining,
  onCheckIn,
}: Props): React.JSX.Element {
  return (
    <Card onPress={onPress} style={styles.card} testID={`challenge-${challenge.id}`}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{challenge.emoji}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.meta}>
            {formatChipLabel(challenge.startDate)} – {formatChipLabel(challenge.endDate)} · {challenge.participantCount} participantes
          </Text>
        </View>
        {challenge.finished ? (
          <View style={styles.finishedBadge}>
            <Text style={styles.finishedText}>Encerrado</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.description} numberOfLines={2}>{challenge.description}</Text>
      {challenge.finished ? null : challenge.joinedByMe ? (
        <View style={styles.actionsRow}>
          <View style={styles.joinedBadge}>
            <Text style={styles.joinedText}>✓ Participando</Text>
          </View>
          {onCheckIn ? (
            <Button size='sm' onPress={onCheckIn} testID={`challenge-checkin-${challenge.id}`}>
              Check-in de hoje
            </Button>
          ) : null}
        </View>
      ) : (
        <Button size='sm' onPress={onJoin} loading={joining}>Participar</Button>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emoji: { fontSize: typography.fontSize.xxl },
  headerText: { flex: 1 },
  title: { fontSize: typography.fontSize.md, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  meta: { fontSize: 12, color: colors.brandTextMuted, marginTop: 2 },
  description: { fontSize: typography.fontSize.base, color: colors.brandText, lineHeight: 20 },
  joinedBadge: { alignSelf: 'flex-start', backgroundColor: colors.brandSupportSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  joinedText: { fontSize: typography.fontSize.sm, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  finishedBadge: { backgroundColor: colors.brandDivider, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  finishedText: { fontSize: 12, color: colors.brandTextMuted, fontFamily: typography.fontFamily.semiBold },
});
