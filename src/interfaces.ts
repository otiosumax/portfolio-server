interface Project {
  id: string;
  title: string;
  tags: string[];
  description: string;
  githubLink: string;
  imageURL: string;
}

interface ProjectFields {
  title?: string;
  description?: string;
  githubLink?: string;
  imageURL?: string;
  tags?: string[];
}
