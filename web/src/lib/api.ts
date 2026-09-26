import axios from "axios";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
});

export const api = {
  async generateImage(params: { prompt: string; negative_prompt?: string; steps?: number; guidance_scale?: number; width?: number; height?: number; strength?: number; chat_id?: string; init_image?: File }, token: string) {
    const formData = new FormData();
    formData.append("prompt", params.prompt);
    if (params.negative_prompt) formData.append("negative_prompt", params.negative_prompt);
    if (params.steps) formData.append("steps", params.steps.toString());
    if (params.guidance_scale) formData.append("guidance_scale", params.guidance_scale.toString());
    if (params.width) formData.append("width", params.width.toString());
    if (params.height) formData.append("height", params.height.toString());
    if (params.strength) formData.append("strength", params.strength.toString());
    if (params.chat_id) formData.append("chat_id", params.chat_id);
    if (params.init_image) formData.append("init_image", params.init_image);

    const { data } = await apiClient.post("/v1/images/generate", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: `Bearer ${token}`,
      },
    });
    return data;
  },

  async getChats(token: string) {
    const { data } = await apiClient.get(`/v1/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },

  async deleteChat(chatId: string, token: string) {
    const { data } = await apiClient.delete(`/v1/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },

  async getChatJobs(chatId: string, token: string) {
    const { data } = await apiClient.get(`/v1/chats/${chatId}/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },

  async getJobStatus(jobId: string, token: string) {
    const { data } = await apiClient.get(`/v1/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return data;
  },

  async getJobs(token: string, source?: 'api' | 'web') {
    const { data } = await apiClient.get(`/v1/jobs${source ? `?source=${source}` : ''}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return data;
  },

  async deleteJob(jobId: string, token: string) {
    const { data } = await apiClient.delete(`/v1/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return data;
  },

  async getAdminOverview(token: string) {
    const { data } = await apiClient.get("/v1/admin/overview", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async getAdminUsers(token: string, page: number = 1, search: string = "") {
    const { data } = await apiClient.get(`/v1/admin/users?page=${page}${search ? `&search=${search}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async updateUserRole(userId: string, role: string, token: string) {
    const { data } = await apiClient.patch(`/v1/admin/users/${userId}/role`, { role }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async updateUserCredits(userId: string, credits_balance: number, token: string) {
    const { data } = await apiClient.patch(`/v1/admin/users/${userId}/credits`, { credits_balance }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async getAdminJobs(token: string, page: number = 1, search: string = "") {
    const { data } = await apiClient.get(`/v1/admin/jobs?page=${page}${search ? `&search=${search}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async getAdminApiKeys(token: string, page: number = 1) {
    const { data } = await apiClient.get(`/v1/admin/api_keys?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async revokeAdminApiKey(keyId: string, token: string) {
    const { data } = await apiClient.delete(`/v1/admin/api_keys/${keyId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async getApiKeys(token: string) {
    const { data } = await apiClient.get("/v1/api-keys", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async generateApiKey(token: string) {
    const { data } = await apiClient.post("/v1/api-keys", {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async deleteApiKey(keyId: string, token: string) {
    const { data } = await apiClient.delete(`/v1/api-keys/${keyId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async getMe(token: string) {
    const { data } = await apiClient.get("/v1/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async getUserStats(token: string, source?: 'api' | 'web') {
    const { data } = await apiClient.get(`/v1/users/me/stats${source ? `?source=${source}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  },

  async getTelemetryData(query: string, token: string, start?: string, end?: string, step?: string) {
    const params = new URLSearchParams({ query });
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    if (step) params.append("step", step);
    
    const { data } = await apiClient.get(`/v1/admin/telemetry?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data;
  }
};
