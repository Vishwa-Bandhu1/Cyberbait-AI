package com.kineticvault.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.mongodb.uri=mongodb://example.invalid:27017/kineticvault_test",
		"spring.data.mongodb.uri=mongodb://example.invalid:27017/kineticvault_test",
		"app.mongodb.verify-on-startup=false"
})
class KineticvaultBackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
