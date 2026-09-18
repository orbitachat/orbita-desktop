import { getVercelBaseUrl } from './gatewayManager';
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
    creatorCode?: string
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
          avatarUrl: null,
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
    } catch (err) {
      console.warn('[GroupService] Server create failed, running in local fallback:', err);
    }

    const fallbackGroup: GroupInfo = {
      id,
      code,
      name: name.trim(),
      description: description.trim(),
      avatarUrl: null,
      creatorNickname,
      creatorCode: creatorCode || null,
      membersCount: 1,
      maxMembers: 10,
      members: [initialMember],
      createdAt: Date.now(),
      sharedSecret,
    };

    return {
      group: fallbackGroup,
      sharedSecret,
    };
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
    } catch (err) {
      console.warn('[GroupService] Failed to fetch group from server:', err);
    }

    if (isValidGroupCode(code)) {
      const id = deriveGroupId(code);
      const secret = deriveGroupKey(code);
      return {
        id,
        code,
        name: 'Group Chat',
        description: '',
        avatarUrl: null,
        creatorNickname: 'Owner',
        membersCount: 1,
        maxMembers: 10,
        members: [],
        createdAt: Date.now(),
        sharedSecret: secret,
      };
    }

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

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'FAILED' }));
        if (errData.error === 'GROUP_FULL' || res.status === 400) {
          throw new Error('GROUP_FULL');
        }
        throw new Error(errData.error || 'JOIN_FAILED');
      }

      const data = (await res.json()) as { group: GroupInfo };
      return {
        group: { ...data.group, sharedSecret },
        sharedSecret,
      };
    } catch (err: any) {
      if (err.message === 'GROUP_FULL' || err.message === 'INVALID_CODE') {
        throw err;
      }
      console.warn('[GroupService] Server join fallback:', err);
    }

    const fallbackGroup: GroupInfo = {
      id,
      code,
      name: 'Group Chat',
      description: '',
      avatarUrl: null,
      creatorNickname: 'Owner',
      membersCount: 2,
      maxMembers: 10,
      members: [
        {
          nickname,
          userCode,
          role: 'member',
          joinedAt: Date.now(),
          lastSeen: Date.now(),
        },
      ],
      createdAt: Date.now(),
      sharedSecret,
    };

    return {
      group: fallbackGroup,
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

  async kickMember(groupId: string, targetNickname: string, adminNickname: string): Promise<void> {
    try {
      await fetch(`${this.getWorkerUrl()}/groups/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          targetNickname,
          adminNickname,
        }),
      });
    } catch {}
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
}

export const groupService = new GroupService();
