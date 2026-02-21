"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Patient, Consultation, MediaItem } from "@/types/patient";
import { formatDate } from "@/utils/dateUtils";
import LoadingSpinner from "@/components/LoadingSpinner";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CONSULTATION_NOTES_LENGTH = 4000;

function sanitizeTextInput(value: string): string {
  return value.replace(/\s+/g, " ").trimStart();
}

export default function PatientDetailPage() {
  const { currentUser, loading: authLoading, getIdToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);
  const selectedConsultation = patient?.consultations?.find((c) => c.id === selectedConsultationId) || null;
  const [showNewConsultationModal, setShowNewConsultationModal] = useState(false);
  const [newConsultationDate, setNewConsultationDate] = useState(new Date().toISOString().split("T")[0]);
  const [newConsultationNotes, setNewConsultationNotes] = useState("");
  const [savingConsultation, setSavingConsultation] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingThumbnails = useRef<Set<string>>(new Set());

  const getThumbnailKey = (consultationId: string, index: number) => `${consultationId}-${index}`;

  const loadThumbnail = async (key: string, fileId: string) => {
    if (loadingThumbnails.current.has(key)) return;
    const idToken = await getIdToken();
    if (!idToken) return;
    loadingThumbnails.current.add(key);
    try {
      const res = await fetch(`/api/media?file_id=${fileId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data.url) {
        setThumbnails((prev) => ({ ...prev, [key]: data.url }));
      }
    } catch (error) {
      console.error("Error loading thumbnail:", error);
    } finally {
      loadingThumbnails.current.delete(key);
    }
  };

  // Fetch patient on mount
  useEffect(() => {
    if (currentUser && patientId) {
      fetchPatient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, patientId]);

  // Clear thumbnails only when switching to a different consultation
  useEffect(() => {
    if (selectedConsultationId) {
      setThumbnails({});
      loadingThumbnails.current.clear();
    }
  }, [selectedConsultationId]);

  // Load thumbnails for current consultation's media
  useEffect(() => {
    if (selectedConsultation?.media && selectedConsultationId) {
      selectedConsultation.media.forEach((item: MediaItem, index: number) => {
        const key = getThumbnailKey(selectedConsultationId, index);
        setThumbnails((prev) => {
          if (prev[key] || loadingThumbnails.current.has(key)) {
            return prev;
          }
          loadThumbnail(key, item.thumbnail_file_id);
          return prev;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConsultation?.media, selectedConsultationId]);

  const fetchPatient = async () => {
    if (!currentUser || !patientId) return;
    try {
      const docRef = doc(db, "patients", patientId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Patient;
        if (data.doctorId !== currentUser.uid || data.isDeleted) {
          router.push("/dashboard");
          return;
        }
        setPatient({ ...data, id: docSnap.id, consultations: data.consultations || [] });
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Error fetching patient:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !patient) return;
    const cleanNotes = sanitizeTextInput(newConsultationNotes).trim();
    if (cleanNotes.length > MAX_CONSULTATION_NOTES_LENGTH) return;
    if (!newConsultationDate || Number.isNaN(Date.parse(newConsultationDate))) return;

    setSavingConsultation(true);
    try {
      const newConsultation: Consultation = {
        id: Date.now().toString(),
        date: new Date(newConsultationDate).toISOString(),
        notes: cleanNotes,
        media: [],
        createdAt: new Date().toISOString(),
      };

      const docRef = doc(db, "patients", patientId);
      await updateDoc(docRef, {
        consultations: arrayUnion(newConsultation),
        updatedAt: serverTimestamp(),
      });

      fetchPatient();
      setShowNewConsultationModal(false);
      setNewConsultationNotes("");
      setNewConsultationDate(new Date().toISOString().split("T")[0]);
    } catch (error) {
      console.error("Error creating consultation:", error);
    } finally {
      setSavingConsultation(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConsultation || !patient) return;

    if (file.size > MAX_FILE_SIZE) {
      alert("File size must be under 50MB");
      return;
    }

    setUploading(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) {
        setUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("id_token", idToken);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Upload failed:", errorData);
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await res.json();

      const mediaItem: MediaItem = {
        type: file.type.startsWith("video/") ? "video" : "image",
        thumbnail_file_id: data.thumbnail_file_id,
        full_res_file_id: data.full_res_file_id,
        uploadedAt: new Date().toISOString(),
      };

      const updatedConsultations = (patient.consultations || []).map((c) =>
        c.id === selectedConsultation.id
          ? { ...c, media: [...(c.media || []), mediaItem] }
          : c
      );

      const docRef = doc(db, "patients", patientId);
      await updateDoc(docRef, {
        consultations: updatedConsultations,
        updatedAt: serverTimestamp(),
      });

      await fetchPatient();
      if (selectedConsultation) {
        setSelectedConsultationId(selectedConsultation.id);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleUpdateNotes = async (consultationId: string, newNotes: string) => {
    if (!patient) return;
    const cleanNotes = sanitizeTextInput(newNotes).slice(0, MAX_CONSULTATION_NOTES_LENGTH);

    try {
      const updatedConsultations = (patient.consultations || []).map((c) =>
        c.id === consultationId ? { ...c, notes: cleanNotes } : c
      );

      const docRef = doc(db, "patients", patientId);
      await updateDoc(docRef, {
        consultations: updatedConsultations,
        updatedAt: serverTimestamp(),
      });

      fetchPatient();
    } catch (error) {
      console.error("Error updating notes:", error);
    }
  };

  const openLightbox = async (index: number) => {
    setSelectedMedia(index);
    setLightboxLoading(true);
    setLightboxUrl(null);

    const mediaItem = selectedConsultation?.media[index];
    if (!mediaItem) return;

    try {
      const idToken = await getIdToken();
      if (!idToken) return;
      const res = await fetch(`/api/media?file_id=${mediaItem.full_res_file_id}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      setLightboxUrl(data.url);
    } catch (error) {
      console.error("Error loading full res:", error);
    } finally {
      setLightboxLoading(false);
    }
  };

  const closeLightbox = () => {
    setSelectedMedia(null);
    setLightboxUrl(null);
  };

  const navigateMedia = (direction: "prev" | "next") => {
    if (selectedMedia === null || !selectedConsultation) return;
    const newIndex = direction === "prev" ? selectedMedia - 1 : selectedMedia + 1;
    if (newIndex >= 0 && newIndex < selectedConsultation.media.length) {
      openLightbox(newIndex);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedMedia === null) return;
      if (e.key === "ArrowLeft") navigateMedia("prev");
      if (e.key === "ArrowRight") navigateMedia("next");
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMedia]);

  if (authLoading || loading || !currentUser) {
    return <LoadingSpinner fullScreen />;
  }

  if (!patient) {
    return <LoadingSpinner fullScreen />;
  }

  const sortedConsultations = [...(patient.consultations || [])].sort((a, b) => {
    const getDate = (date: unknown): number => {
      if (!date) return 0;
      if (date instanceof Date) return date.getTime();
      if (date && typeof date === "object" && "toDate" in date) {
        return (date as { toDate: () => Date }).toDate().getTime();
      }
      return new Date(date as string).getTime();
    };
    return getDate(b.date) - getDate(a.date);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{patient.patientName}</h1>
          <p className="text-gray-600">Date of Birth: {patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "Not specified"}</p>
          <p className="text-gray-600">Total Consultations: {patient.consultations?.length || 0}</p>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Consultations</h2>
          <button
            onClick={() => setShowNewConsultationModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Consultation
          </button>
        </div>

        {sortedConsultations.length === 0 ? (
          <p className="text-center text-gray-500">No consultations yet.</p>
        ) : (
          <div className="space-y-4">
            {sortedConsultations.map((consultation) => {
              const isExpanded = selectedConsultation?.id === consultation.id;
              return (
                <div
                  key={consultation.id}
                  className={`bg-white rounded-lg shadow transition-all duration-300 ${
                    isExpanded ? "ring-2 ring-blue-500" : ""
                  }`}
                >
                  <div
                    className="p-6 cursor-pointer"
                    onClick={() => setSelectedConsultationId(isExpanded ? null : consultation.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {formatDate(consultation.date)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {consultation.media?.length || 0} photos/videos
                        </p>
                      </div>
                      <svg 
                        className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap mt-2">
                      {consultation.notes || "No notes"}
                    </p>
                  </div>
                  
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="px-6 pb-6 border-t border-gray-100">
                      <div className="mt-4">
                        <textarea
                          value={consultation.notes || ""}
                          onChange={(e) => handleUpdateNotes(consultation.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          rows={4}
                          maxLength={MAX_CONSULTATION_NOTES_LENGTH}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="Add notes..."
                        />
                      </div>

                      <div className="mt-4">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,video/*"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          disabled={uploading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {uploading ? "Uploading..." : "Upload Photo/Video"}
                        </button>
                      </div>

                      {consultation.media && consultation.media.length > 0 ? (
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {consultation.media.map((item: MediaItem, index: number) => (
                            <div
                              key={index}
                              onClick={(e) => {
                                e.stopPropagation();
                                openLightbox(index);
                              }}
                              className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 relative"
                            >
                              {thumbnails[getThumbnailKey(consultation.id, index)] ? (
                                <Image
                                  src={thumbnails[getThumbnailKey(consultation.id, index)]}
                                  alt={`Media ${index + 1}`}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <LoadingSpinner size="md" />
                                </div>
                              )}
                              {item.type === "video" && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <svg className="w-12 h-12 text-white opacity-80" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : isExpanded && (
                        <p className="mt-4 text-gray-500">No photos or videos for this consultation.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showNewConsultationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full text-gray-900">
            <h3 className="text-lg font-semibold mb-4">New Consultation</h3>
            <form onSubmit={handleCreateConsultation}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={newConsultationDate}
                  onChange={(e) => setNewConsultationDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Notes</label>
                <textarea
                  value={newConsultationNotes}
                onChange={(e) => setNewConsultationNotes(e.target.value)}
                rows={4}
                maxLength={MAX_CONSULTATION_NOTES_LENGTH}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Add initial notes..."
              />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewConsultationModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConsultation}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingConsultation ? "Saving..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedMedia !== null && selectedConsultation && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" onClick={closeLightbox}>
          <button onClick={(e) => { e.stopPropagation(); closeLightbox(); }} className="absolute top-4 right-4 text-white text-2xl">×</button>
          
          {selectedMedia > 0 && (
            <button onClick={(e) => { e.stopPropagation(); navigateMedia("prev"); }} className="absolute left-4 text-white text-4xl">‹</button>
          )}
          
          {selectedMedia < selectedConsultation.media.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); navigateMedia("next"); }} className="absolute right-4 text-white text-4xl">›</button>
          )}

          <div className="max-w-4xl max-h-4xl" onClick={(e) => e.stopPropagation()}>
            {selectedConsultation.media[selectedMedia].type === "video" ? (
              lightboxUrl ? (
                <video src={lightboxUrl} controls className="max-w-full max-h-[90vh]" />
              ) : lightboxLoading ? (
                <LoadingSpinner size="lg" color="white" />
              ) : (
                <button onClick={async () => {
                  setLightboxLoading(true);
                  const idToken = await getIdToken();
                  if (!idToken) return;
                  const res = await fetch(`/api/media?file_id=${selectedConsultation.media[selectedMedia].full_res_file_id}`, {
                    headers: { Authorization: `Bearer ${idToken}` },
                  });
                  const data = await res.json();
                  setLightboxUrl(data.url);
                  setLightboxLoading(false);
                }} className="px-4 py-2 bg-white text-black rounded-lg">Play Video</button>
              )
            ) : lightboxUrl ? (
              <Image
                src={lightboxUrl}
                alt="Full resolution"
                width={1200}
                height={1200}
                className="max-w-full max-h-[90vh] object-contain"
                unoptimized
              />
            ) : lightboxLoading && thumbnails[getThumbnailKey(selectedConsultationId!, selectedMedia)] ? (
              <Image
                src={thumbnails[getThumbnailKey(selectedConsultationId!, selectedMedia)]}
                alt="Loading..."
                width={1200}
                height={1200}
                className="max-w-full max-h-[90vh] object-contain blur-sm"
                unoptimized
              />
            ) : null}
          </div>

          <div className="absolute bottom-4 text-white text-sm">
            {selectedMedia + 1} / {selectedConsultation.media.length}
          </div>
        </div>
      )}
    </div>
  );
}
