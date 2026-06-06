package com.kineticvault.backend.repository;

import com.kineticvault.backend.model.Report;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReportRepository extends MongoRepository<Report, String> {
    Optional<Report> findByMessageId(String messageId);
    List<Report> findAllByOrderByCreatedAtDesc();
}
