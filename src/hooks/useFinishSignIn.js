import { useState, useEffect } from 'react';
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export function useFinishSignIn() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const auth = getAuth();
    
    // 1. Vérifier que l'URL actuelle est bien un lien de connexion Firebase
    if (isSignInWithEmailLink(auth, window.location.href)) {
      
      // 2. Récupérer l'email depuis localStorage
      let email = window.localStorage.getItem('emailForSignIn');
      
      // 3. Si l'email n'est pas dans localStorage, le demander à l'utilisateur
      if (!email) {
        email = window.prompt('Veuillez entrer votre adresse email pour confirmer la connexion :');
      }

      if (email) {
        // 4. Finaliser la connexion avec signInWithEmailLink
        signInWithEmailLink(auth, email, window.location.href)
          .then((result) => {
            // 5. Supprimer l'email du localStorage après connexion réussie
            window.localStorage.removeItem('emailForSignIn');
            
            // 6. Rediriger l'utilisateur vers la page d'accueil
            navigate('/');
          })
          .catch((err) => {
            // 7. Gérer proprement les erreurs
            setLoading(false);
            if (err.code === 'auth/invalid-email') {
              setError("L'adresse email fournie n'est pas valide.");
            } else if (err.code === 'auth/invalid-action-code') {
              setError("Le lien de connexion a expiré ou a déjà été utilisé.");
            } else {
              setError("Une erreur s'est produite lors de la connexion.");
            }
          });
      } else {
        setLoading(false);
        setError("L'adresse email est requise pour finaliser la connexion.");
      }
    } else {
      setLoading(false);
      setError("Le lien de connexion est invalide.");
    }
  }, [navigate]);

  return { loading, error };
}
