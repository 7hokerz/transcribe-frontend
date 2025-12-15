"use client";

import { create } from "zustand";

export type TaskStatus = "idle" | "uploading" | "processing" | "done" | "failed";

interface VideoTaskState {
  isParsing: boolean;
  selectedFileName: string | null;
  finalText: string;
  uploadProgress: number;
  status: TaskStatus;
  jobId: string | null;
  lastCheckedAt: string | null;
  errorMessage: string | null;

  actions: {
    setContent: (content: string) => void;
    setSelectedFileName: (name: string | null) => void;
    setIsParsing: (value: boolean) => void;
    setUploadProgress: (value: number) => void;
    setStatus: (status: TaskStatus) => void;
    setJobId: (jobId: string | null) => void;
    setLastCheckedAt: (iso: string | null) => void;
    setErrorMessage: (message: string | null) => void;
    reset: () => void;
  };
}

export type TaskActions = VideoTaskState["actions"];

export const useTaskStore = create<VideoTaskState>((set) => ({
  isParsing: false,
  selectedFileName: null,
  finalText: "",
  uploadProgress: 0,
  status: "idle",
  jobId: null,
  lastCheckedAt: null,
  errorMessage: null,

  actions: {
    setContent: (content) => set(() => ({ finalText: content })),

    setSelectedFileName: (name) => set(() => ({ selectedFileName: name })),

    setIsParsing: (value) => set(() => ({ isParsing: value })),

    setUploadProgress: (value) => set(() => ({ uploadProgress: value })),

    setStatus: (status) => set(() => ({ status })),

    setJobId: (jobId) => set(() => ({ jobId })),

    setLastCheckedAt: (iso) => set(() => ({ lastCheckedAt: iso })),

    setErrorMessage: (message) => set(() => ({ errorMessage: message })),

    reset: () =>
      set(() => ({
        isParsing: false,
        selectedFileName: null,
        finalText: "",
        uploadProgress: 0,
        status: "idle",
        jobId: null,
        lastCheckedAt: null,
        errorMessage: null,
      })),
  },
}));
