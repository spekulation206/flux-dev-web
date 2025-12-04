import React from "react";
import { useObjectUrl } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface FileImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  file: File | Blob;
}

export function FileImage({ file, className, alt, ...props }: FileImageProps) {
  const url = useObjectUrl(file);

  if (!url) return <div className={cn("bg-muted animate-pulse", className)} />;

  return <img src={url} alt={alt} className={className} {...props} />;
}
