interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  className?: string;
  color?: "blue" | "white";
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

const colorClasses = {
  blue: "border-blue-600",
  white: "border-white",
};

export default function LoadingSpinner({ size = "md", fullScreen = false, className = "", color = "blue" }: LoadingSpinnerProps) {
  const spinner = (
    <div className={`animate-spin rounded-full border-t-2 border-b-2 ${colorClasses[color]} ${sizeClasses[size]} ${className}`}></div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {spinner}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      {spinner}
    </div>
  );
}
