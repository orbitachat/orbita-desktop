import { createClient } from '@supabase/supabase-js';
import { getVercelBaseUrl } from './gatewayManager';
import { getPusher, getGroupPusher } from '../utils/pusher';
import { supabaseService } from './supabaseService';
import { generateGroupId, generateGroupInviteCode } from '../lib/codes';
import {
  deriveGroupKey,
  extractGroupCode,
  isValidGroupCode,
} from '../lib/groupCrypto';
import { encryptMessage } from '../lib/crypto';
import { useChatStore, type Message } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';

export interface GroupMemberInfo {
  nickname: string;
  userCode?: string;
  userId?: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
  lastSeen?: number;
  avatarUrl?: string | null;
}

export interface GroupInfo {
  id: string;
  code: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  creatorNickname: string;
  creatorCode?: string | null;
  membersCount: number;
  maxMembers: number;
  members: GroupMemberInfo[];
  createdAt: number;
  sharedSecret?: string;
  inviteActive?: boolean;
  inviteExpiresAt?: number | null;
}

const GROUPS_SUPABASE_URL = 'https://vxjaybyveerulkdqhggr.supabase.co';
const GROUPS_SUPABASE_KEY = 'sb_publishable_x6OPhg68nS-xBcPn4K47NQ_2nSS4Kfu';

class GroupService {
  private supabase = createClient(GROUPS_SUPABASE_URL, GROUPS_SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  private getWorkerUrl(): string {
    return getVercelBaseUrl();
  }

  async createGroup(
    name: string,
    description: string,
    creatorNickname: string,
    creatorCode?: string,
    avatarUrl?: string | null,
    creatorUserId?: string,
    creatorAvatarUrl?: string | null
  ): Promise<{ group: GroupInfo; sharedSecret: string } | null> {
    const id = generateGroupId();
    const code = generateGroupInviteCode();
    const sharedSecret = deriveGroupKey(id);

    const initialMember: GroupMemberInfo = {
      nickname: creatorNickname,
      userCode: creatorCode || creatorNickname,
      userId: creatorUserId || creatorCode || creatorNickname,
      role: 'owner',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      avatarUrl: creatorAvatarUrl || null,
    };

    const inviteMeta = JSON.stringify({ active: true, expiresAt: null });
    const nowIso = new Date().toISOString();

    try {
      await this.supabase.from('groups').upsert({
        id,
        code,
        name: name.trim(),
        description: description.trim(),
        avatar_url: avatarUrl || null,
        creator_id: inviteMeta,
        creator_code: creatorCode || null,
        creator_nickname: creatorNickname,
        max_members: 10,
        members_count: 1,
        created_at: nowIso,
        updated_at: nowIso,
      });

      await this.supabase.from('group_members').upsert({
        group_id: id,
        user_code: creatorCode || creatorNickname,
        user_id: creatorUserId || creatorCode || null,
        nickname: creatorNickname,
        role: 'owner',
        joined_at: nowIso,
        last_seen: nowIso,
        avatar_url: creatorAvatarUrl || null,
      });
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          code,
          name: name.trim(),
          description: description.trim(),
          avatarUrl: avatarUrl || null,
          creatorNickname,
          creatorCode: creatorCode || null,
          creatorUserId: creatorUserId || null,
          maxMembers: 10,
          members: [initialMember],
          membersCount: 1,
        }),
      }).catch(() => {});
    } catch {}

    const group: GroupInfo = {
      id,
      code,
      name: name.trim(),
      description: description.trim(),
      avatarUrl: avatarUrl || null,
      creatorNickname,
      creatorCode: creatorCode || null,
      membersCount: 1,
      maxMembers: 10,
      members: [initialMember],
      createdAt: Date.now(),
      sharedSecret,
      inviteActive: true,
      inviteExpiresAt: null,
    };

    this.sendSystemMessage(id, sharedSecret, 'create', creatorNickname);
    return { group, sharedSecret };
  }

  async getGroup(groupIdOrCode: string): Promise<GroupInfo | null> {
    const raw = groupIdOrCode.trim();
    const code = extractGroupCode(raw) || raw;

    try {
      let query = this.supabase.from('groups').select('*');
      if (code.length === 36 && /^[0-9A-Z]{36}$/i.test(code)) {
        query = query.eq('id', code.toUpperCase());
      } else {
        query = query.eq('code', code);
      }
      const { data: g } = await query.maybeSingle();
      if (g) {
        const { data: membersRows } = await this.supabase.from('group_members').select('*').eq('group_id', g.id);
        const members: GroupMemberInfo[] = (membersRows || []).map((m: any) => ({
          nickname: m.nickname,
          userCode: m.user_code,
          userId: m.user_id || m.user_code,
          role: m.role || 'member',
          joinedAt: new Date(m.joined_at || g.created_at).getTime(),
          lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
          avatarUrl: m.avatar_url || null,
        }));

        let inviteActive = true;
        let expiresAt: number | null = null;
        if (g.creator_id && typeof g.creator_id === 'string' && g.creator_id.startsWith('{')) {
          try {
            const parsed = JSON.parse(g.creator_id);
            if (parsed.active === false) inviteActive = false;
            if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
          } catch {}
        }

        return {
          id: g.id,
          code: g.code,
          name: g.name,
          description: g.description || '',
          avatarUrl: g.avatar_url || null,
          creatorNickname: g.creator_nickname,
          creatorCode: g.creator_code || null,
          membersCount: g.members_count || members.length || 1,
          maxMembers: g.max_members || 10,
          members,
          createdAt: new Date(g.created_at).getTime(),
          sharedSecret: deriveGroupKey(g.id),
          inviteActive,
          inviteExpiresAt: expiresAt,
        };
      }
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/get?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = (await res.json()) as { group: GroupInfo };
        if (data.group) {
          return { ...data.group, sharedSecret: deriveGroupKey(data.group.id) };
        }
      }
    } catch {}

    return null;
  }

  async joinGroup(
    codeOrLink: string,
    nickname: string,
    userCode?: string,
    meta?: { name?: string; creator?: string; avatarUrl?: string; description?: string; userId?: string },
    inviterNickname?: string
  ): Promise<{ group: GroupInfo; sharedSecret: string }> {
    const raw = codeOrLink.trim();
    const code = extractGroupCode(raw) || raw;

    if (!code || !isValidGroupCode(code)) {
      throw new Error('INVALID_CODE');
    }

    if (raw.length === 36 && /^[0-9A-Z]{36}$/i.test(raw) && !raw.startsWith('join_')) {
      throw new Error('LINK_REQUIRED');
    }

    let groupRow: any = null;

    try {
      const { data } = await this.supabase.from('groups').select('*').eq('code', code).maybeSingle();
      if (data) {
        groupRow = data;
      }
    } catch {}

    if (!groupRow) {
      try {
        const res = await fetch(`${this.getWorkerUrl()}/groups/get?code=${encodeURIComponent(code)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.group) groupRow = data.group;
        }
      } catch {}
    }

    if (!groupRow) {
      throw new Error('GROUP_NOT_FOUND');
    }

    let inviteActive = true;
    let expiresAt: number | null = null;
    if (groupRow.creator_id) {
      try {
        const parsed = typeof groupRow.creator_id === 'string' && groupRow.creator_id.startsWith('{') ? JSON.parse(groupRow.creator_id) : null;
        if (parsed) {
          if (parsed.active === false) inviteActive = false;
          if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
        }
      } catch {}
    }

    if (!inviteActive) {
      throw new Error('INVITE_REVOKED');
    }

    if (expiresAt && Date.now() > expiresAt) {
      throw new Error('INVITE_EXPIRED');
    }

    const groupId = groupRow.id;
    const sharedSecret = deriveGroupKey(groupId);
    const candidateId = meta?.userId || userCode;
    const memberCode = userCode || candidateId || nickname;
    const nowIso = new Date().toISOString();

    let currentMembers: any[] = [];
    try {
      const { data: membersRows } = await this.supabase.from('group_members').select('*').eq('group_id', groupId);
      currentMembers = membersRows || [];
    } catch {}

    const isAlreadyMember = currentMembers.some((m: any) => {
      const mId = m.user_id || m.user_code;
      if (candidateId && mId) return mId === candidateId;
      if (memberCode && mId) return mId === memberCode;
      return false;
    });

    if (!isAlreadyMember && currentMembers.length >= 10) {
      throw new Error('GROUP_FULL');
    }

    try {
      await this.supabase.from('group_members').upsert({
        group_id: groupId,
        user_code: memberCode,
        user_id: meta?.userId || candidateId || memberCode,
        nickname,
        role: 'member',
        joined_at: nowIso,
        last_seen: nowIso,
        avatar_url: meta?.avatarUrl || null,
      });
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: groupId,
          code,
          nickname,
          userCode: memberCode,
          userId: meta?.userId || candidateId || memberCode,
          name: groupRow.name,
          creatorNickname: groupRow.creator_nickname,
          avatarUrl: meta?.avatarUrl || groupRow.avatar_url || null,
        }),
      }).catch(() => {});
    } catch {}

    if (!isAlreadyMember) {
      if (inviterNickname) {
        this.sendSystemMessage(groupId, sharedSecret, 'invite', inviterNickname, nickname);
      } else {
        this.sendSystemMessage(groupId, sharedSecret, 'join', nickname, nickname);
      }
    }

    let formattedMembers: GroupMemberInfo[] = [];
    try {
      const { data: updatedMembers } = await this.supabase.from('group_members').select('*').eq('group_id', groupId);
      formattedMembers = (updatedMembers || currentMembers).map((m: any) => ({
        nickname: m.nickname,
        userCode: m.user_code,
        userId: m.user_id || m.user_code,
        role: m.role || 'member',
        joinedAt: new Date(m.joined_at || Date.now()).getTime(),
        lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
        avatarUrl: m.avatar_url || null,
      }));
    } catch {
      formattedMembers = [{
        nickname,
        userCode: memberCode,
        userId: meta?.userId || candidateId || memberCode,
        role: 'member',
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        avatarUrl: meta?.avatarUrl || null,
      }];
    }

    const resultGroup: GroupInfo = {
      id: groupId,
      code: groupRow.code,
      name: groupRow.name,
      description: groupRow.description || '',
      avatarUrl: groupRow.avatar_url || null,
      creatorNickname: groupRow.creator_nickname,
      creatorCode: groupRow.creator_code || null,
      membersCount: Math.max(formattedMembers.length, 1),
      maxMembers: 10,
      members: formattedMembers,
      createdAt: new Date(groupRow.created_at || Date.now()).getTime(),
      sharedSecret,
      inviteActive,
      inviteExpiresAt: expiresAt,
    };

    return { group: resultGroup, sharedSecret };
  }

  async resetInviteLink(groupId: string): Promise<string | null> {
    const newCode = generateGroupInviteCode();
    const nowIso = new Date().toISOString();
    try {
      const { data: existing } = await this.supabase.from('groups').select('creator_id').eq('id', groupId).maybeSingle();
      let meta: any = { active: true, expiresAt: null };
      if (existing?.creator_id && typeof existing.creator_id === 'string' && existing.creator_id.startsWith('{')) {
        try { meta = { ...JSON.parse(existing.creator_id), active: true }; } catch {}
      }
      await this.supabase.from('groups').update({
        code: newCode,
        creator_id: JSON.stringify(meta),
        updated_at: nowIso,
      }).eq('id', groupId);

      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, code: newCode }),
      }).catch(() => {});

      return newCode;
    } catch {
      return null;
    }
  }

  async revokeInviteLink(groupId: string): Promise<boolean> {
    const nowIso = new Date().toISOString();
    try {
      const { data: existing } = await this.supabase.from('groups').select('creator_id').eq('id', groupId).maybeSingle();
      let meta: any = { active: false, expiresAt: null };
      if (existing?.creator_id && typeof existing.creator_id === 'string' && existing.creator_id.startsWith('{')) {
        try { meta = { ...JSON.parse(existing.creator_id), active: false }; } catch {}
      }
      await this.supabase.from('groups').update({
        creator_id: JSON.stringify(meta),
        updated_at: nowIso,
      }).eq('id', groupId);
      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, inviteActive: false }),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async enableInviteLink(groupId: string): Promise<boolean> {
    const nowIso = new Date().toISOString();
    try {
      const { data: existing } = await this.supabase.from('groups').select('creator_id').eq('id', groupId).maybeSingle();
      let meta: any = { active: true, expiresAt: null };
      if (existing?.creator_id && typeof existing.creator_id === 'string' && existing.creator_id.startsWith('{')) {
        try { meta = { ...JSON.parse(existing.creator_id), active: true }; } catch {}
      }
      await this.supabase.from('groups').update({
        creator_id: JSON.stringify(meta),
        updated_at: nowIso,
      }).eq('id', groupId);
      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, inviteActive: true }),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async setInviteExpiration(groupId: string, expiresAt: number | null): Promise<boolean> {
    const nowIso = new Date().toISOString();
    try {
      const { data: existing } = await this.supabase.from('groups').select('creator_id').eq('id', groupId).maybeSingle();
      let meta: any = { active: true, expiresAt };
      if (existing?.creator_id && typeof existing.creator_id === 'string' && existing.creator_id.startsWith('{')) {
        try { meta = { ...JSON.parse(existing.creator_id), expiresAt }; } catch {}
      }
      await this.supabase.from('groups').update({
        creator_id: JSON.stringify(meta),
        updated_at: nowIso,
      }).eq('id', groupId);
      fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, inviteExpiresAt: expiresAt }),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async leaveGroup(groupId: string, nickname: string, userCode?: string, userId?: string): Promise<void> {
    try {
      const filters = [`nickname.eq.${nickname}`];
      if (userCode) {
        filters.push(`user_code.eq.${userCode}`);
        filters.push(`user_id.eq.${userCode}`);
      }
      if (userId && userId !== userCode) {
        filters.push(`user_code.eq.${userId}`);
        filters.push(`user_id.eq.${userId}`);
      }
      await this.supabase.from('group_members').delete().eq('group_id', groupId).or(filters.join(','));
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          nickname,
          userCode: userCode || null,
          userId: userId || null,
        }),
      }).catch(() => {});
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const leaveData = {
        type: 'member-left',
        groupId,
        nickname,
        userCode: userCode || null,
        userId: userId || null,
      };
      const sendLeave = () => {
        try { channel.trigger('member-left', leaveData); } catch {}
        try { channel.trigger('client-message', leaveData); } catch {}
      };
      if (channel.subscribed) sendLeave();
      else channel.bind('pusher:subscription_succeeded', sendLeave);
    } catch {}

    const secret = deriveGroupKey(groupId);
    this.sendSystemMessage(groupId, secret, 'leave', nickname);
  }

  async kickMember(groupId: string, targetNickname: string, adminNickname: string, targetUserCode?: string, targetUserId?: string): Promise<void> {
    try {
      const filters = [`nickname.eq.${targetNickname}`];
      if (targetUserCode) {
        filters.push(`user_code.eq.${targetUserCode}`);
        filters.push(`user_id.eq.${targetUserCode}`);
      }
      if (targetUserId && targetUserId !== targetUserCode) {
        filters.push(`user_code.eq.${targetUserId}`);
        filters.push(`user_id.eq.${targetUserId}`);
      }
      await this.supabase.from('group_members').delete().eq('group_id', groupId).or(filters.join(','));
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          targetNickname,
          targetUserCode: targetUserCode || null,
          targetUserId: targetUserId || null,
          adminNickname,
        }),
      }).catch(() => {});
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const kickData = {
        type: 'kick',
        target: targetNickname,
        targetNickname,
        targetUserCode: targetUserCode || null,
        targetUserId: targetUserId || null,
        admin: adminNickname,
      };
      const sendKick = () => {
        try { channel.trigger('kick', kickData); } catch {}
        try { channel.trigger('client-message', kickData); } catch {}
      };
      if (channel.subscribed) sendKick();
      else channel.bind('pusher:subscription_succeeded', sendKick);
    } catch {}

    const secret = deriveGroupKey(groupId);
    this.sendSystemMessage(groupId, secret, 'kick', adminNickname, targetNickname);
  }

  async updateGroup(
    groupId: string,
    data: { name?: string; description?: string; avatarUrl?: string | null },
    actorNickname?: string
  ): Promise<boolean> {
    const actor = actorNickname || useAuthStore.getState().nickname || '';
    const secret = deriveGroupKey(groupId);
    if (data.name !== undefined) {
      this.sendSystemMessage(groupId, secret, 'title', actor, undefined);
    }
    if (data.avatarUrl !== undefined) {
      this.sendSystemMessage(groupId, secret, 'avatar', actor, undefined);
    }

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.description !== undefined) updatePayload.description = data.description.trim();
    if (data.avatarUrl !== undefined) updatePayload.avatar_url = data.avatarUrl;

    try {
      await this.supabase.from('groups').update(updatePayload).eq('id', groupId);
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          name: data.name,
          description: data.description,
          avatarUrl: data.avatarUrl,
        }),
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const deleteData = { type: 'group-deleted', groupId };
      const sendDelete = () => {
        try { channel.trigger('group-deleted', deleteData); } catch {}
        try { channel.trigger('client-message', deleteData); } catch {}
      };
      if (channel.subscribed) sendDelete();
      else channel.bind('pusher:subscription_succeeded', sendDelete);
    } catch {}

    try {
      await Promise.allSettled([
        this.supabase.from('group_members').delete().eq('group_id', groupId),
        this.supabase.from('group_messages').delete().eq('group_id', groupId),
        this.supabase.from('group_calls').delete().eq('group_id', groupId),
        this.supabase.from('groups').delete().eq('id', groupId),
      ]);
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      return res.ok;
    } catch {
      return true;
    }
  }

  async updateMemberRole(
    groupId: string,
    targetNickname: string,
    role: 'admin' | 'member',
    targetUserCode?: string,
    actorNickname?: string
  ): Promise<boolean> {
    try {
      let q = this.supabase.from('group_members').update({ role }).eq('group_id', groupId);
      if (targetUserCode) {
        q = q.or(`user_code.eq.${targetUserCode},user_id.eq.${targetUserCode}`);
      } else {
        q = q.eq('nickname', targetNickname);
      }
      await q;
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, targetNickname, targetUserCode: targetUserCode || null, role }),
      });
      const actor = actorNickname || useAuthStore.getState().nickname || '';
      const secret = deriveGroupKey(groupId);
      if (role === 'admin') {
        this.sendSystemMessage(groupId, secret, 'admin', actor, targetNickname);
      } else if (role === 'member') {
        this.sendSystemMessage(groupId, secret, 'unadmin', actor, targetNickname);
      }
      return res.ok;
    } catch {
      return true;
    }
  }

  async addMember(
    _groupId: string,
    groupCode: string,
    nickname: string,
    userCode?: string,
    avatarUrl?: string | null,
    inviterNickname?: string
  ): Promise<GroupInfo | null> {
    try {
      const res = await this.joinGroup(groupCode, nickname, userCode, { avatarUrl: avatarUrl || undefined }, inviterNickname);
      return res.group;
    } catch {
      return null;
    }
  }

  async fetchGroupMessages(groupId: string, limit = 100): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data)) {
        return data.reverse();
      }
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/messages?groupId=${encodeURIComponent(groupId)}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.messages) ? data.messages : [];
      }
    } catch {}
    return [];
  }

  async sendGroupMessage(payload: any): Promise<string | null> {
    const msgId = payload.id || `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nowIso = new Date().toISOString();

    const row = {
      id: msgId,
      group_id: payload.groupId,
      sender_code: payload.senderCode || payload.senderNickname,
      sender_id: payload.senderId || null,
      sender_nickname: payload.senderNickname,
      ciphertext: payload.ciphertext,
      media_type: payload.mediaType || null,
      media_url: payload.mediaUrl || null,
      media_name: payload.mediaName || null,
      media_key: payload.mediaKey || null,
      mime: payload.mime || null,
      duration: payload.duration || null,
      width: payload.width || null,
      height: payload.height || null,
      waveform: payload.waveform || null,
      audio_metadata: payload.audioMetadata || null,
      link_preview: payload.linkPreview || null,
      created_at: nowIso,
    };

    try {
      await this.supabase.from('group_messages').insert(row);
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, id: msgId }),
      }).catch(() => {});
    } catch {}

    return msgId;
  }

  async sendSystemMessage(
    groupId: string,
    sharedSecret: string,
    eventType: 'join' | 'title' | 'avatar' | 'admin' | 'unadmin' | 'call' | 'call_ended' | 'kick' | 'create' | 'invite' | 'leave',
    actorNickname: string,
    targetNickname?: string
  ): Promise<void> {
    const actor = actorNickname || useAuthStore.getState().nickname || 'Участник';
    const textMap: Record<string, string> = {
      create: `${actor} создал(а) группу`,
      invite: `${actor} пригласил(а) ${targetNickname || ''} в группу`,
      join: `${actor} вступил(а) в группу`,
      leave: `${actor} покинул(а) группу`,
      title: `${actor} изменил(а) имя группы`,
      avatar: `${actor} изменил(а) аватарку группы`,
      admin: `${actor} назначил(а) ${targetNickname || ''} администратором`,
      unadmin: `${actor} снял(а) ${targetNickname || ''} с администратора`,
      call: `${actor} начал(а) голосовой чат`,
      call_ended: 'Голосовой звонок завершен',
      kick: `${actor} удалил(а) ${targetNickname || ''} из группы`,
    };
    const text = textMap[eventType] || eventType;
    const msgId = `sys_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const payload = JSON.stringify({
      text,
      mediaType: 'system',
      systemType: eventType,
      actorNickname: actor,
      targetNickname,
    });
    let ciphertext = payload;
    try {
      ciphertext = await encryptMessage(payload, sharedSecret);
    } catch {}

    const systemMsg: Message = {
      id: msgId,
      sender: 'system',
      text,
      time: Date.now(),
      status: 'sent',
      mediaType: 'system',
      systemType: eventType,
      actorNickname: actor,
      targetNickname,
    };
    useChatStore.getState().addMessage(groupId, systemMsg);
    try {
      (window as any).orbita?.storageAddMessage?.(groupId, msgId, systemMsg);
    } catch {}

    try {
      const groupPusher = getGroupPusher();
      const channel = groupPusher.subscribe(`presence-group-${groupId}`);
      const pusherPayload = {
        id: msgId,
        messageId: msgId,
        chatId: groupId,
        sender: 'system',
        senderNickname: 'system',
        senderCode: 'system',
        ciphertext,
        type: 'message',
        mediaType: 'system',
        systemType: eventType,
        actorNickname: actor,
        targetNickname,
        time: Date.now(),
        text,
      };
      const doSend = () => {
        try { channel.trigger('client-message', pusherPayload); } catch {}
      };
      if (channel.subscribed) doSend(); else channel.bind('pusher:subscription_succeeded', doSend);
    } catch {}

    await this.sendGroupMessage({
      id: msgId,
      groupId,
      senderNickname: 'system',
      senderCode: 'system',
      ciphertext,
      mediaType: 'system',
    });
  }

  async markGroupMessagesRead(payload: {
    groupId: string;
    messageId?: string;
    readIds?: string[];
    time?: number;
    sender?: string;
    senderUserId?: string;
    senderCode?: string;
  }): Promise<void> {
    try {
      fetch(`${this.getWorkerUrl()}/groups/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
  }

  async getActiveCall(groupId: string): Promise<any | null> {
    try {
      const { data } = await this.supabase
        .from('group_calls')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'active')
        .maybeSingle();

      if (data) {
        return {
          groupId: data.group_id,
          roomName: data.room_name,
          status: data.status,
          hostCode: data.host_code,
          hostNickname: data.host_nickname,
          participantsCount: data.participants_count || 1,
        };
      }
    } catch {}

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/calls/active?groupId=${encodeURIComponent(groupId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.call) {
          return {
            groupId: data.call.group_id,
            roomName: data.call.room_name,
            status: data.call.status,
            hostCode: data.call.host_code,
            hostNickname: data.call.host_nickname,
            participantsCount: data.call.participants_count || 1,
          };
        }
      }
    } catch {}
    return null;
  }

  async startCall(groupId: string, roomName: string, hostCode: string, hostNickname: string): Promise<void> {
    const nowIso = new Date().toISOString();
    try {
      await this.supabase.from('group_calls').upsert({
        group_id: groupId,
        room_name: roomName,
        status: 'active',
        host_code: hostCode,
        host_nickname: hostNickname,
        participants_count: 1,
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, roomName, hostCode, hostNickname }),
      }).catch(() => {});
    } catch {}

    const secret = deriveGroupKey(groupId);
    this.sendSystemMessage(groupId, secret, 'call', hostNickname);
  }

  async endCall(groupId: string, actorNickname?: string): Promise<void> {
    try {
      await this.supabase.from('group_calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('group_id', groupId);
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/calls/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      }).catch(() => {});
    } catch {}

    const secret = deriveGroupKey(groupId);
    this.sendSystemMessage(groupId, secret, 'call_ended', actorNickname || '');
  }

  async fetchMyGroups(userCode: string, userId?: string): Promise<(GroupInfo & { role: string })[]> {
    try {
      const filters: string[] = [];
      if (userCode) {
        filters.push(`user_code.eq.${userCode}`);
        filters.push(`user_id.eq.${userCode}`);
      }
      if (userId && userId !== userCode) {
        filters.push(`user_code.eq.${userId}`);
        filters.push(`user_id.eq.${userId}`);
      }
      if (filters.length > 0) {
        const { data: memberRows } = await this.supabase
          .from('group_members')
          .select('group_id, role')
          .or(filters.join(','));

        if (memberRows && memberRows.length > 0) {
          const groupIds = memberRows.map((r: any) => r.group_id);
          const { data: groups } = await this.supabase.from('groups').select('*').in('id', groupIds);
          const roleMap: Record<string, string> = {};
          memberRows.forEach((r: any) => { roleMap[r.group_id] = r.role; });

          const results = await Promise.all((groups || []).map(async (g: any) => {
            const { data: members } = await this.supabase.from('group_members').select('*').eq('group_id', g.id);
            const formatted = (members || []).map((m: any) => ({
              nickname: m.nickname,
              userCode: m.user_code,
              userId: m.user_id || m.user_code,
              role: m.role || 'member',
              joinedAt: new Date(m.joined_at || g.created_at).getTime(),
              lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
              avatarUrl: m.avatar_url || null,
            }));

            let inviteActive = true;
            let expiresAt: number | null = null;
            if (g.creator_id && typeof g.creator_id === 'string' && g.creator_id.startsWith('{')) {
              try {
                const parsed = JSON.parse(g.creator_id);
                if (parsed.active === false) inviteActive = false;
                if (typeof parsed.expiresAt === 'number') expiresAt = parsed.expiresAt;
              } catch {}
            }

            return {
              id: g.id,
              code: g.code,
              name: g.name,
              description: g.description || '',
              avatarUrl: g.avatar_url || null,
              creatorNickname: g.creator_nickname,
              creatorCode: g.creator_code || null,
              membersCount: g.members_count || formatted.length || 1,
              maxMembers: g.max_members || 10,
              members: formatted,
              createdAt: new Date(g.created_at).getTime(),
              role: roleMap[g.id] || 'member',
              sharedSecret: deriveGroupKey(g.id),
              inviteActive,
              inviteExpiresAt: expiresAt,
            };
          }));

          if (results.length > 0) return results;
        }
      }
    } catch {}

    try {
      const q = new URLSearchParams();
      if (userCode) q.set('userCode', userCode);
      if (userId) q.set('userId', userId);
      const res = await fetch(`${this.getWorkerUrl()}/groups/my?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return (data.groups || []).map((g: any) => ({
          ...g,
          sharedSecret: deriveGroupKey(g.id),
        }));
      }
    } catch {}
    return [];
  }

  async notifyMember(targetUserCode: string, group: GroupInfo, targetUserId?: string): Promise<void> {
    const targets = Array.from(new Set([targetUserCode, targetUserId].filter(Boolean) as string[]));
    try {
      const pusher = getPusher();
      if (pusher) {
        targets.forEach((tCode) => {
          const chan = pusher.subscribe(`private-handshake-${tCode}`);
          const doTrigger = () => {
            try {
              chan.trigger('client-group-added', { group });
            } catch {}
          };
          if (chan.subscribed) {
            doTrigger();
          } else {
            chan.bind('pusher:subscription_succeeded', () => {
              doTrigger();
            });
          }
        });
      }
    } catch {}

    try {
      targets.forEach((tCode) => {
        supabaseService.saveNonMessage(
          `grp_inv_${group.id}`,
          'system',
          tCode,
          JSON.stringify({ type: 'group-added', group }),
          `grp_msg_${group.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        ).catch(() => {});
      });
    } catch {}

    try {
      fetch(`${this.getWorkerUrl()}/groups/notify-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserCode, targetUserId, group }),
      }).catch(() => {});
    } catch {}
  }
}

export const groupService = new GroupService();
