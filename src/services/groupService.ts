import { getVercelBaseUrl } from './gatewayManager';
import { getPusher } from '../utils/pusher';
import { supabaseService } from './supabaseService';
import {
  generateGroupCode,
  deriveGroupId,
  deriveGroupKey,
  extractGroupCode,
  isValidGroupCode,
} from '../lib/groupCrypto';



export interface GroupMemberInfo {
  nickname: string;
  userCode?: string;
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
}

class GroupService {
  private getWorkerUrl(): string {
    return getVercelBaseUrl();
  }

  async createGroup(
    name: string,
    description: string,
    creatorNickname: string,
    creatorCode?: string,
    avatarUrl?: string | null
  ): Promise<{ group: GroupInfo; sharedSecret: string } | null> {
    const code = generateGroupCode();
    const id = deriveGroupId(code);
    const sharedSecret = deriveGroupKey(code);

    const initialMember: GroupMemberInfo = {
      nickname: creatorNickname,
      userCode: creatorCode,
      role: 'owner',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      avatarUrl: avatarUrl || null,
    };

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/create`, {
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
          maxMembers: 10,
          members: [initialMember],
          membersCount: 1,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { group: GroupInfo };
        return {
          group: { ...data.group, sharedSecret },
          sharedSecret,
        };
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || `Server responded with ${res.status}`);
    } catch (err) {
      throw err;
    }
  }

  async getGroup(groupIdOrCode: string): Promise<GroupInfo | null> {
    const code = extractGroupCode(groupIdOrCode) || groupIdOrCode.trim();
    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/get?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = (await res.json()) as { group: GroupInfo };
        if (data.group) {
          const secret = isValidGroupCode(data.group.code) ? deriveGroupKey(data.group.code) : undefined;
          return { ...data.group, sharedSecret: secret };
        }
      }
    } catch {}

    return null;
  }

  async joinGroup(
    codeOrLink: string,
    nickname: string,
    userCode?: string
  ): Promise<{ group: GroupInfo; sharedSecret: string }> {
    const code = extractGroupCode(codeOrLink);
    if (!code || !isValidGroupCode(code)) {
      throw new Error('INVALID_CODE');
    }

    const id = deriveGroupId(code);
    const sharedSecret = deriveGroupKey(code);

    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          code,
          nickname,
          userCode: userCode || null,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { group: GroupInfo };
        if (data.group) {
          return {
            group: { ...data.group, sharedSecret },
            sharedSecret,
          };
        }
      }
    } catch {}

    return {
      group: {
        id,
        code,
        name: 'Группа',
        description: '',
        avatarUrl: null,
        creatorNickname: '',
        creatorCode: undefined,
        membersCount: 1,
        maxMembers: 10,
        members: [{
          nickname,
          userCode: userCode || nickname,
          role: 'member',
          joinedAt: Date.now(),
        }],
        createdAt: Date.now(),
        sharedSecret,
      },
      sharedSecret,
    };
  }

  async leaveGroup(groupId: string, nickname: string, userCode?: string): Promise<void> {
    try {
      await fetch(`${this.getWorkerUrl()}/groups/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          nickname,
          userCode: userCode || null,
        }),
      });
    } catch {}
  }

  async kickMember(groupId: string, targetNickname: string, adminNickname: string, targetUserCode?: string): Promise<void> {
    try {
      await fetch(`${this.getWorkerUrl()}/groups/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          targetNickname,
          targetUserCode: targetUserCode || null,
          adminNickname,
        }),
      });
    } catch {}
  }

  async updateGroup(
    groupId: string,
    data: { name?: string; description?: string; avatarUrl?: string | null }
  ): Promise<boolean> {
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
      return false;
    }
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async updateMemberRole(
    groupId: string,
    targetNickname: string,
    role: 'admin' | 'member',
    targetUserCode?: string
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, targetNickname, targetUserCode: targetUserCode || null, role }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async addMember(
    groupId: string,
    groupCode: string,
    nickname: string,
    userCode?: string,
    avatarUrl?: string | null
  ): Promise<GroupInfo | null> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: groupId,
          code: groupCode,
          nickname,
          userCode: userCode || nickname,
          avatarUrl: avatarUrl || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.group || null;
      }
    } catch {}
    return null;
  }

  async fetchGroupMessages(groupId: string, limit = 100): Promise<any[]> {
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
    try {
      const res = await fetch(`${this.getWorkerUrl()}/groups/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        return data.id || null;
      }
    } catch {}
    return null;
  }

  async getActiveCall(groupId: string): Promise<any | null> {
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
    try {
      await fetch(`${this.getWorkerUrl()}/groups/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, roomName, hostCode, hostNickname }),
      });
    } catch {}
  }

  async endCall(groupId: string): Promise<void> {
    try {
      await fetch(`${this.getWorkerUrl()}/groups/calls/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
    } catch {}
  }
  async fetchMyGroups(userCode: string, nickname?: string): Promise<(GroupInfo & { role: string })[]> {
    try {
      const q = new URLSearchParams();
      if (userCode) q.set('userCode', userCode);
      if (nickname) q.set('nickname', nickname);
      const res = await fetch(`${this.getWorkerUrl()}/groups/my?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return (data.groups || []).map((g: any) => ({
          ...g,
          sharedSecret: isValidGroupCode(g.code) ? deriveGroupKey(g.code) : undefined,
        }));
      }
    } catch {}
    return [];
  }

  async notifyMember(targetUserCode: string, group: GroupInfo, targetNickname?: string): Promise<void> {
    const targets = Array.from(new Set([targetUserCode, targetNickname].filter(Boolean) as string[]));
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
      await fetch(`${this.getWorkerUrl()}/groups/notify-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserCode, targetNickname, group }),
      });
    } catch {}
  }
}

export const groupService = new GroupService();
