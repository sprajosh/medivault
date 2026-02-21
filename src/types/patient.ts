export interface MediaItem {
  type: "image" | "video";
  thumbnail_file_id: string;
  full_res_file_id: string;
  uploadedAt: string;
}

export interface Consultation {
  id: string;
  date: string;
  notes: string;
  media: MediaItem[];
  createdAt: string;
}

export interface Patient {
  id: string;
  doctorId: string;
  patientName: string;
  dateOfBirth: string;
  consultations: Consultation[];
  createdAt: string;
  isDeleted?: boolean;
}
